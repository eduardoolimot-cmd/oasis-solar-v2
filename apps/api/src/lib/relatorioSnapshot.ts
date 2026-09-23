import { buscarClimaDiario } from "./clima";
import { carregarCurvaDegradacao, fatorDegradacao } from "./degradacao";
import { mesesInteiramenteCobertos } from "./mesesCobertos";
import { prisma } from "./prisma";
import { calcularPrDiarioPareado, geracaoPorDia, irradiacaoRepresentativaPorDia } from "./seriesDiarias";

// Snapshot do Relatório de Geração Solar (mesma estrutura do modelo "Relatório UFV Sítio do
// Pescoço 07/2026"): 1. Dados da instalação · 2. Resumo operacional do mês (previsto × realizado +
// clima) · 3. Geração por SKID · 4. Histórico de manutenção/ocorrências. Reaproveita as mesmas
// regras de cálculo do Painel Principal (meses inteiramente cobertos, PR pareado dia a dia). Uma
// vez gerado, é gravado em RelatorioEmitido e o arquivo é sempre regerado a partir dele — nunca
// recalculado com dados atuais. "versao: 2" distingue do formato antigo (Fase 8).

export interface RelatorioSnapshot {
  versao: 2;
  usina: {
    id: string;
    nome: string;
    potenciaDcKwp: number;
    inicioOperacao: string | null;
    latitude: number | null;
    longitude: number | null;
    totalModulos: number | null;
    totalInversores: number;
  };
  periodo: { inicio: string; fim: string };
  responsavel: string | null;
  resumo: {
    geracao: { previstoKwh: number | null; realizadoKwh: number | null };
    irradiacao: { previstoKwhM2: number | null; realizadoKwhM2: number | null };
    pr: { previstoPct: number | null; realizadoPct: number | null };
  };
  clima: { disponivel: boolean; precipitacaoAcumuladaMm: number | null; diasComChuva: number | null; aviso: string | null };
  skids: { nome: string; uc: string | null; previstoKwh: number | null; realizadoKwh: number | null }[];
  manutencao: { tipo: "Corretiva" | "Preventiva" | "Ocorrência"; data: string; titulo: string; responsavel: string | null }[];
}

export async function montarRelatorioSnapshot(usinaId: string, inicio: Date, fim: Date, responsavel: string | null): Promise<RelatorioSnapshot | null> {
  const usina = await prisma.usina.findUnique({
    where: { id: usinaId },
    include: { skids: { where: { ativo: true }, orderBy: { nome: "asc" } } },
  });
  if (!usina) return null;

  const fimInclusivo = new Date(fim.getTime() + 86_400_000);
  const mesesCobertos = mesesInteiramenteCobertos(inicio, fim);
  const filtroMeses = mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes }));

  // ---- Realizado (usina) ----
  const [totalRealizado, irradiacaoUsina, geracaoUsina] = await Promise.all([
    prisma.lancamentoGeracaoDiaria.aggregate({
      where: { usinaId, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
      _sum: { energiaKwh: true },
      _count: { _all: true },
    }),
    irradiacaoRepresentativaPorDia(usinaId, inicio, fim),
    geracaoPorDia(usinaId, inicio, fim),
  ]);
  const geracaoRealizadaKwh = totalRealizado._count._all > 0 ? totalRealizado._sum.energiaKwh! : null;
  const irradiacaoRealizadaKwhM2 = irradiacaoUsina.size > 0 ? [...irradiacaoUsina.values()].reduce((s, v) => s + v, 0) : null;
  const prRealizadoPct = calcularPrDiarioPareado(geracaoUsina, irradiacaoUsina, usina.potenciaDcKwp).agregado.prPct;

  // ---- Previsto (usina) — só meses inteiramente cobertos pelo período ----
  const previsoes = mesesCobertos.length
    ? await prisma.previsaoMensal.findMany({ where: { usinaId, ativo: true, OR: filtroMeses } })
    : [];
  // Previsão de energia (usina e SKIDs) ajustada pela degradação (lib/degradacao.ts); a irradiação e
  // o PR previstos não são degradados.
  const curvaDegradacao = await carregarCurvaDegradacao(usinaId);
  const comGeracao = previsoes.filter((p) => p.geracaoPrevistaKwh !== null);
  const geracaoPrevistaKwh = comGeracao.length ? comGeracao.reduce((s, p) => s + p.geracaoPrevistaKwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0) : null;
  const comIrradiacao = previsoes.filter((p) => p.irradiacaoPrevistaKwhM2 !== null);
  const irradiacaoPrevistaKwhM2 = comIrradiacao.length ? comIrradiacao.reduce((s, p) => s + p.irradiacaoPrevistaKwhM2!, 0) : null;
  const comPr = previsoes.filter((p) => p.prPrevistoPct !== null && p.geracaoPrevistaKwh !== null);
  const geracaoDosMesesComPr = comPr.reduce((s, p) => s + p.geracaoPrevistaKwh!, 0);
  const prPrevistoPct =
    comPr.length && geracaoDosMesesComPr > 0
      ? Number((comPr.reduce((s, p) => s + p.prPrevistoPct! * p.geracaoPrevistaKwh!, 0) / geracaoDosMesesComPr).toFixed(4))
      : null;

  // ---- Clima (chuva acumulada) — depende das coordenadas cadastradas na usina ----
  let clima: RelatorioSnapshot["clima"];
  if (usina.latitude === null || usina.longitude === null) {
    clima = { disponivel: false, precipitacaoAcumuladaMm: null, diasComChuva: null, aviso: "Coordenadas da usina não cadastradas — chuva acumulada não calculável." };
  } else {
    const dias = await buscarClimaDiario(usina.latitude, usina.longitude, inicio, fim);
    const comMedicao = dias.filter((d) => d.precipitacaoMm !== null);
    clima = comMedicao.length
      ? {
          disponivel: true,
          precipitacaoAcumuladaMm: Number(comMedicao.reduce((s, d) => s + d.precipitacaoMm!, 0).toFixed(1)),
          diasComChuva: comMedicao.filter((d) => (d.precipitacaoMm ?? 0) >= 1).length,
          aviso:
            comMedicao.length < Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1
              ? `Fonte meteorológica cobriu ${comMedicao.length} dos ${Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1} dias do período.`
              : null,
        }
      : { disponivel: false, precipitacaoAcumuladaMm: null, diasComChuva: null, aviso: "Sem dados meteorológicos para o período." };
  }

  // ---- Geração por SKID ----
  const realizadoPorSkid = await prisma.lancamentoGeracaoDiaria.groupBy({
    by: ["skidId"],
    where: { usinaId, inversorId: { not: null }, skidId: { not: null }, data: { gte: inicio, lte: fim } },
    _sum: { energiaKwh: true },
  });
  const previstoSkidMensal = mesesCobertos.length
    ? await prisma.previsaoMensalSkid.findMany({
        where: { usinaId, ativo: true, OR: filtroMeses, geracaoEGridKwh: { not: null } },
        select: { skidId: true, ano: true, mes: true, geracaoEGridKwh: true },
      })
    : [];
  const previstoSkidKwh = (skidId: string) => {
    const linhas = previstoSkidMensal.filter((p) => p.skidId === skidId);
    return linhas.length ? linhas.reduce((s, p) => s + p.geracaoEGridKwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0) : null;
  };
  const skids = usina.skids.map((s) => ({
    nome: s.nome,
    uc: s.uc,
    previstoKwh: previstoSkidKwh(s.id),
    realizadoKwh: realizadoPorSkid.find((r) => r.skidId === s.id)?._sum.energiaKwh ?? null,
  }));

  // ---- Histórico de manutenção / ocorrências no período ----
  const [ordens, eventos, totalInversores] = await Promise.all([
    prisma.ordemServico.findMany({
      where: {
        usinaId,
        status: { not: "CANCELADA" },
        OR: [
          { dataConclusao: { gte: inicio, lt: fimInclusivo } },
          { dataConclusao: null, dataPrevista: { gte: inicio, lt: fimInclusivo } },
          { dataConclusao: null, dataPrevista: null, criadoEm: { gte: inicio, lt: fimInclusivo } },
        ],
      },
    }),
    prisma.eventoOperacional.findMany({ where: { usinaId, inicio: { gte: inicio, lt: fimInclusivo } } }),
    prisma.inversor.count({ where: { usinaId, ativo: true } }),
  ]);
  const responsaveis = await prisma.usuario.findMany({
    where: { id: { in: ordens.map((o) => o.responsavelId).filter((id): id is string => !!id) } },
    select: { id: true, nome: true },
  });
  const nomeResponsavel = (id: string | null) => (id ? responsaveis.find((u) => u.id === id)?.nome ?? null : null);

  const manutencao: RelatorioSnapshot["manutencao"] = [
    ...ordens.map((o) => ({
      tipo: (o.tipo === "PREVENTIVA" ? "Preventiva" : "Corretiva") as "Preventiva" | "Corretiva",
      data: (o.dataConclusao ?? o.dataPrevista ?? o.criadoEm).toISOString(),
      titulo: o.titulo,
      responsavel: nomeResponsavel(o.responsavelId),
    })),
    ...eventos.map((e) => ({
      tipo: "Ocorrência" as const,
      data: e.inicio.toISOString(),
      titulo: `${e.tipo === "GERACAO" ? "Parada de geração" : "Falha de comunicação"}${e.motivo ? ` — ${e.motivo}` : ""}`,
      responsavel: null,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  return {
    versao: 2,
    usina: {
      id: usina.id,
      nome: usina.nome,
      potenciaDcKwp: usina.potenciaDcKwp,
      inicioOperacao: usina.inicioOperacao?.toISOString() ?? null,
      latitude: usina.latitude,
      longitude: usina.longitude,
      totalModulos: usina.totalModulos,
      totalInversores,
    },
    periodo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    responsavel,
    resumo: {
      geracao: { previstoKwh: geracaoPrevistaKwh, realizadoKwh: geracaoRealizadaKwh },
      irradiacao: { previstoKwhM2: irradiacaoPrevistaKwhM2, realizadoKwhM2: irradiacaoRealizadaKwhM2 },
      pr: { previstoPct: prPrevistoPct, realizadoPct: prRealizadoPct },
    },
    clima,
    skids,
    manutencao,
  };
}
