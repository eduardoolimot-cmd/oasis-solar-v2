import { buscarClimaDiario, DiaClima } from "./clima";
import { carregarCurvaDegradacao, fatorDegradacao } from "./degradacao";
import { calcularGeracaoUsina } from "./geracaoUsina";
import { mesesInteiramenteCobertos } from "./mesesCobertos";
import { prisma } from "./prisma";
import { calcularPrDiarioPareado, irradiacaoRepresentativaPorDia } from "./seriesDiarias";

// Snapshot do Relatório de Geração Solar (estrutura do modelo "Relatório UFV Sítio do Pescoço
// 07/2026", ampliada): 1. Dados da instalação · 2. Resumo operacional do mês · 3. Geração de energia
// bruta e irradiação (gráfico diário com clima) · 4. Geração por SKID · 5. Histórico de
// manutenção/ocorrências. Reaproveita as regras de cálculo do Painel Principal (meses inteiramente
// cobertos, PR pareado dia a dia, previsão diária de lib/geracaoUsina.ts). Uma vez gerado, é gravado
// em RelatorioEmitido e o arquivo é sempre regerado a partir dele — nunca recalculado com dados
// atuais. "versao" distingue os formatos: sem versão = antigo (Fase 8, relatorioLegado.ts); 2 = sem
// série diária nem detalhe da manutenção (o PDF sai sem o gráfico); 3 = atual.

/// Clima do dia no relatório: dia de chuva = precipitação >= 1 mm (mesmo critério de "dias com
/// chuva" do resumo); abaixo disso vale a cobertura do céu (garoa fraca conta como nublado).
export type ClimaRelatorio = "SOL" | "NUBLADO" | "CHUVA";

export interface RelatorioSnapshot {
  versao: 2 | 3;
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
  /// Série diária do gráfico (versão 3).
  diario?: { data: string; energiaKwh: number | null; previstaKwh: number | null; irradiacaoKwhM2: number | null; clima: ClimaRelatorio | null; chuvaMm: number | null }[];
  /// status, local e detalhe existem a partir da versão 3.
  manutencao: {
    tipo: "Corretiva" | "Preventiva" | "Ocorrência";
    data: string;
    titulo: string;
    responsavel: string | null;
    status?: string;
    local?: string;
    detalhe?: string | null;
  }[];
}

const STATUS_OS: Record<string, string> = { ABERTA: "Aberta", EM_ANDAMENTO: "Em andamento", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };

function climaDoDia(d: DiaClima): ClimaRelatorio {
  if ((d.precipitacaoMm ?? 0) >= 1) return "CHUVA";
  return d.categoria === "SOL" ? "SOL" : "NUBLADO";
}

/// Campo "Rótulo: valor" gravado ao fim da descrição (ex.: OS importadas de planilha).
function campoDaDescricao(descricao: string | null, rotulo: string): string | null {
  return descricao?.match(new RegExp(`^${rotulo}:\\s*(.+)$`, "m"))?.[1]?.trim() || null;
}

/// Trecho da descrição para o relatório: sem as linhas de campo/origem, em uma linha, até 170 caracteres.
function resumoDaDescricao(descricao: string | null): string | null {
  if (!descricao) return null;
  const texto = descricao
    .split("\n")
    .filter((l) => !/^(Responsável|Local\/Componente):|^Importado de /.test(l.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) return null;
  return texto.length > 170 ? `${texto.slice(0, 167).trimEnd()}…` : texto;
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
  const [totalRealizado, irradiacaoUsina, geracaoPeriodo] = await Promise.all([
    prisma.lancamentoGeracaoDiaria.aggregate({
      where: { usinaId, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
      _sum: { energiaKwh: true },
      _count: { _all: true },
    }),
    irradiacaoRepresentativaPorDia(usinaId, inicio, fim),
    calcularGeracaoUsina(usinaId, inicio, fim),
  ]);
  const geracaoRealizadaKwh = totalRealizado._count._all > 0 ? totalRealizado._sum.energiaKwh! : null;
  const irradiacaoRealizadaKwhM2 = irradiacaoUsina.size > 0 ? [...irradiacaoUsina.values()].reduce((s, v) => s + v, 0) : null;
  const prRealizadoPct = calcularPrDiarioPareado(geracaoPeriodo.energiaPorDia, irradiacaoUsina, usina.potenciaDcKwp).agregado.prPct;

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
  let diasClima: DiaClima[] = [];
  if (usina.latitude === null || usina.longitude === null) {
    clima = { disponivel: false, precipitacaoAcumuladaMm: null, diasComChuva: null, aviso: "Coordenadas da usina não cadastradas — chuva acumulada não calculável." };
  } else {
    const dias = await buscarClimaDiario(usina.latitude, usina.longitude, inicio, fim);
    diasClima = dias;
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

  // ---- Série diária (gráfico "Geração de energia bruta e irradiação") ----
  const climaPorDia = new Map(diasClima.map((d) => [d.data, d]));
  const diario: NonNullable<RelatorioSnapshot["diario"]> = [];
  for (const c = new Date(inicio); c <= fim; c.setUTCDate(c.getUTCDate() + 1)) {
    const dia = c.toISOString().slice(0, 10);
    const cl = climaPorDia.get(dia);
    diario.push({
      data: dia,
      energiaKwh: geracaoPeriodo.energiaPorDia.get(dia) ?? null,
      previstaKwh: geracaoPeriodo.geracaoPrevistaPorDia.get(dia) ?? null,
      irradiacaoKwhM2: irradiacaoUsina.get(dia) ?? null,
      clima: cl ? climaDoDia(cl) : null,
      chuvaMm: cl?.precipitacaoMm ?? null,
    });
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
      include: { skid: { select: { nome: true } } },
    }),
    prisma.eventoOperacional.findMany({ where: { usinaId, inicio: { gte: inicio, lt: fimInclusivo } }, include: { skid: { select: { nome: true } } } }),
    prisma.inversor.count({ where: { usinaId, ativo: true } }),
  ]);
  const responsaveis = await prisma.usuario.findMany({
    where: { id: { in: ordens.map((o) => o.responsavelId).filter((id): id is string => !!id) } },
    select: { id: true, nome: true },
  });
  const nomeResponsavel = (id: string | null) => (id ? responsaveis.find((u) => u.id === id)?.nome ?? null : null);

  // Responsável: usuário do sistema; sem ele, o "Responsável:" registrado na descrição (OS
  // importadas). Local: SKID da OS; sem ele, o "Local/Componente:" da descrição; senão a usina toda.
  const manutencao: RelatorioSnapshot["manutencao"] = [
    ...ordens.map((o) => ({
      tipo: (o.tipo === "PREVENTIVA" ? "Preventiva" : "Corretiva") as "Preventiva" | "Corretiva",
      data: (o.dataConclusao ?? o.dataPrevista ?? o.criadoEm).toISOString(),
      titulo: o.titulo,
      responsavel: nomeResponsavel(o.responsavelId) ?? campoDaDescricao(o.descricao, "Responsável"),
      status: STATUS_OS[o.status] ?? o.status,
      local: o.skid?.nome ?? campoDaDescricao(o.descricao, "Local/Componente") ?? "Usina inteira",
      detalhe: resumoDaDescricao(o.descricao),
    })),
    ...eventos.map((e) => ({
      tipo: "Ocorrência" as const,
      data: e.inicio.toISOString(),
      titulo: e.tipo === "GERACAO" ? "Parada de geração" : "Falha de comunicação",
      responsavel: null,
      status: e.fim ? "Encerrada" : "Em aberto",
      local: e.skid?.nome ?? "Usina inteira",
      detalhe: e.motivo ?? null,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return {
    versao: 3,
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
    diario,
    manutencao,
  };
}
