import { Router } from "express";
import { carregarCurvaDegradacao, fatorDegradacao } from "../../lib/degradacao";
import { calcularGeracaoUsina, diasDoPeriodo } from "../../lib/geracaoUsina";
import { calcularAderencia, calcularIPE, calcularRE } from "../../lib/indicadores";
import { resolverPeriodo } from "../../lib/periodo";
import { prisma } from "../../lib/prisma";
import { calcularPrDiarioPareado, geracaoPorDia, irradiacaoRepresentativaPorDia } from "../../lib/seriesDiarias";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao, usinasAutorizadas } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

// Custo de O&M por kWp depende de lançamentos financeiros (Financeiro, Fase 7), ainda não
// implementado. Disponibilidade/MTTR/MTBF já são calculados a partir de eventos operacionais
// (Manutenção, Fase 6) na aba correspondente do Dashboard individual — ver
// usinas/disponibilidade.routes.ts. Retornar "Sem dados" explicitamente é a regra da especificação
// — nunca substituir por 0 ou inventar um valor.
const AVISO_INDICADORES_PENDENTES =
  "Custo de O&M por kWp depende do módulo Financeiro (Fase 7) — ainda não implementado.";

async function calcularPrPeriodoPareado(usinaId: string, potenciaDcKwp: number, inicio: Date, fim: Date) {
  const [irradiacao, geracao] = await Promise.all([
    irradiacaoRepresentativaPorDia(usinaId, inicio, fim),
    geracaoPorDia(usinaId, inicio, fim),
  ]);
  const { agregado } = calcularPrDiarioPareado(geracao, irradiacao, potenciaDcKwp);
  const irradiacaoSomaKwhM2 = agregado.energiaTeoricaKwh && potenciaDcKwp ? agregado.energiaTeoricaKwh / potenciaDcKwp : null;
  return {
    prPct: agregado.prPct,
    energiaTeoricaKwh: agregado.energiaTeoricaKwh,
    diasComParDados: agregado.dias,
    irradiacaoSomaKwhM2,
  };
}

async function calcularIndicadoresUsina(usinaId: string, inicio: Date, fim: Date, mesesCobertos: { ano: number; mes: number }[]) {
  const usina = await prisma.usina.findUnique({ where: { id: usinaId } });
  if (!usina) return null;

  const geracaoRealizada = await prisma.lancamentoGeracaoDiaria.aggregate({
    where: { usinaId, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
    _sum: { energiaKwh: true },
    _count: { _all: true },
  });
  const energiaRealizadaKwh = geracaoRealizada._count._all > 0 ? geracaoRealizada._sum.energiaKwh! : null;

  const previsoes = await prisma.previsaoMensal.findMany({
    where: {
      usinaId,
      ativo: true,
      OR: mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes })),
    },
    select: { ano: true, mes: true, geracaoPrevistaKwh: true, geracaoP50Kwh: true },
  });
  const mesesComMeta = previsoes.filter((p) => p.geracaoPrevistaKwh !== null || p.geracaoP50Kwh !== null);
  // Previsão de energia ajustada pela degradação (ano de operação de cada mês; lib/degradacao.ts).
  const curvaDegradacao = await carregarCurvaDegradacao(usinaId);
  const energiaPrevistaKwh = mesesComMeta.length
    ? mesesComMeta.reduce((soma, p) => soma + (p.geracaoPrevistaKwh ?? p.geracaoP50Kwh ?? 0) * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0)
    : null;
  const metaParcial = mesesComMeta.length > 0 && mesesComMeta.length < mesesCobertos.length;

  const { prPct, energiaTeoricaKwh, diasComParDados, irradiacaoSomaKwhM2 } = await calcularPrPeriodoPareado(
    usinaId,
    usina.potenciaDcKwp,
    inicio,
    fim
  );

  const diferencaAbsolutaKwh =
    energiaRealizadaKwh !== null && energiaPrevistaKwh !== null ? energiaRealizadaKwh - energiaPrevistaKwh : null;
  const diferencaPercentual = calcularAderencia(energiaRealizadaKwh, energiaPrevistaKwh);

  return {
    usina: {
      id: usina.id,
      nome: usina.nome,
      municipio: usina.municipio,
      uf: usina.uf,
      potenciaDcKwp: usina.potenciaDcKwp,
      situacao: usina.situacao,
      latitude: usina.latitude,
      longitude: usina.longitude,
    },
    geracao: {
      realizadaKwh: energiaRealizadaKwh,
      previstaKwh: energiaPrevistaKwh,
      metaParcial,
      diferencaAbsolutaKwh,
      diferencaPercentual,
    },
    pr: prPct,
    prDiasComDadosPareados: diasComParDados,
    ipe: calcularIPE(energiaRealizadaKwh, energiaPrevistaKwh),
    rendimentoEspecificoKwhKwp: calcularRE(energiaRealizadaKwh, usina.potenciaDcKwp),
    irradiacaoKwhM2: irradiacaoSomaKwhM2,
    _energiaTeoricaKwh: energiaTeoricaKwh,
  };
}

/// Consolida a carteira somando numeradores/denominadores compatíveis — nunca a média dos
/// percentuais de cada usina (PR, IPE e RE da carteira seguem a mesma regra da especificação).
function consolidarCarteira(indicadoresPorUsina: Awaited<ReturnType<typeof calcularIndicadoresUsina>>[]) {
  const validos = indicadoresPorUsina.filter((v): v is NonNullable<typeof v> => v !== null);

  const somar = (extrator: (v: NonNullable<typeof validos[number]>) => number | null) =>
    validos.reduce((soma: number | null, v) => {
      const valor = extrator(v);
      if (valor === null) return soma;
      return (soma ?? 0) + valor;
    }, null as number | null);

  const potenciaTotalKwp = somar((v) => v.usina.potenciaDcKwp);
  const realizadaTotalKwh = somar((v) => v.geracao.realizadaKwh);
  const previstaTotalKwh = somar((v) => v.geracao.previstaKwh);
  const energiaTeoricaTotalKwh = somar((v) => v._energiaTeoricaKwh);

  return {
    usinasComScore: validos.length,
    potenciaTotalKwp,
    geracao: {
      realizadaKwh: realizadaTotalKwh,
      previstaKwh: previstaTotalKwh,
      diferencaAbsolutaKwh:
        realizadaTotalKwh !== null && previstaTotalKwh !== null ? realizadaTotalKwh - previstaTotalKwh : null,
      diferencaPercentual: calcularAderencia(realizadaTotalKwh, previstaTotalKwh),
    },
    pr: energiaTeoricaTotalKwh && energiaTeoricaTotalKwh > 0 && realizadaTotalKwh !== null ? Number(((100 * realizadaTotalKwh) / energiaTeoricaTotalKwh).toFixed(4)) : null,
    ipe: calcularIPE(realizadaTotalKwh, previstaTotalKwh),
    rendimentoEspecificoKwhKwp: calcularRE(realizadaTotalKwh, potenciaTotalKwp),
  };
}

router.get("/resumo", exigirPermissao("painel", "visualizar"), async (req, res) => {
  const permitidas = await usinasAutorizadas(req.usuario!, "painel", "visualizar");
  const usinasBase = await prisma.usina.findMany({
    where: permitidas ? { id: { in: permitidas } } : undefined,
    select: { id: true },
    orderBy: { nome: "asc" },
  });

  const { inicio, fim, mesesCobertos } = resolverPeriodo(req.query);

  const indicadores = await Promise.all(usinasBase.map((u) => calcularIndicadoresUsina(u.id, inicio, fim, mesesCobertos)));
  const consolidado = consolidarCarteira(indicadores);
  const usinas = indicadores
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map(({ _energiaTeoricaKwh, ...resto }) => resto);

  res.json({ periodo: { inicio, fim }, consolidado, usinas, avisoIndicadoresPendentes: AVISO_INDICADORES_PENDENTES });
});

// Visão consolidada "Todas as usinas" do Painel Principal — mesmo recorte de datas (início/fim) das
// abas do painel individual. Cada usina é calculada exatamente como na aba "Geração de Energia
// Bruta" (lib/geracaoUsina.ts) e a carteira é a SOMA de numeradores e denominadores compatíveis —
// nunca a média dos percentuais das usinas. Percentuais (aderências, PR, rendimento) só consideram
// as usinas que têm os DOIS lados da conta no período; as demais são listadas, nunca tratadas
// como zero.
router.get("/consolidado", exigirPermissao("painel", "visualizar"), async (req, res) => {
  const hoje = new Date();
  const fim = req.query.fim ? new Date(String(req.query.fim)) : hoje;
  const inicio = req.query.inicio ? new Date(String(req.query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return res.status(400).json({ erro: "Datas inválidas." });
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const permitidas = await usinasAutorizadas(req.usuario!, "painel", "visualizar");
  const usinas = await prisma.usina.findMany({
    where: permitidas ? { id: { in: permitidas } } : undefined,
    select: { id: true, nome: true, potenciaDcKwp: true },
    orderBy: { nome: "asc" },
  });

  const porUsina = await Promise.all(
    usinas.map(async (u) => {
      const [g, irradiacao] = await Promise.all([calcularGeracaoUsina(u.id, inicio, fim), irradiacaoRepresentativaPorDia(u.id, inicio, fim)]);
      const pr = calcularPrDiarioPareado(g.energiaPorDia, irradiacao, u.potenciaDcKwp).agregado;
      return { usina: u, g, pr };
    })
  );

  const soma = (valores: (number | null)[]) => {
    const presentes = valores.filter((v): v is number => v !== null);
    return presentes.length ? presentes.reduce((a, b) => a + b, 0) : null;
  };
  // Aderência da carteira a uma meta: só usinas com realizado E meta no período.
  const aderenciaCarteira = (meta: (x: (typeof porUsina)[number]) => number | null) => {
    const comparaveis = porUsina.filter((x) => x.g.energiaBrutaKwh !== null && meta(x) !== null);
    return {
      realizadoKwh: soma(comparaveis.map((x) => x.g.energiaBrutaKwh)),
      metaKwh: soma(comparaveis.map(meta)),
      usinas: comparaveis.length,
    };
  };

  const realizadoKwh = soma(porUsina.map((x) => x.g.energiaBrutaKwh));
  const previstaKwh = soma(porUsina.map((x) => x.g.geracaoPrevistaPeriodoKwh));
  const prevista = aderenciaCarteira((x) => x.g.geracaoPrevistaPeriodoKwh);
  const p50 = aderenciaCarteira((x) => x.g.p50Kwh);
  const p90 = aderenciaCarteira((x) => x.g.p90Kwh);
  const energiaPareada = soma(porUsina.map((x) => x.pr.energiaRealizadaKwh));
  const energiaTeorica = soma(porUsina.map((x) => x.pr.energiaTeoricaKwh));
  const comRealizado = porUsina.filter((x) => x.g.energiaBrutaKwh !== null);

  const graficoDiario = diasDoPeriodo(inicio, fim).map((dia) => ({
    data: dia,
    energiaKwh: soma(porUsina.map((x) => x.g.energiaPorDia.get(dia) ?? null)),
    geracaoPrevistaKwh: soma(porUsina.map((x) => x.g.geracaoPrevistaPorDia.get(dia) ?? null)),
  }));

  res.json({
    periodo: { inicio, fim },
    totalUsinas: usinas.length,
    potenciaTotalKwp: soma(usinas.map((u) => u.potenciaDcKwp)),
    kpis: {
      realizadoKwh,
      previstaKwh,
      aderenciaPrevistaPct: calcularAderencia(prevista.realizadoKwh, prevista.metaKwh),
      p50Kwh: p50.metaKwh,
      p90Kwh: p90.metaKwh,
      aderenciaP50Pct: calcularAderencia(p50.realizadoKwh, p50.metaKwh),
      aderenciaP90Pct: calcularAderencia(p90.realizadoKwh, p90.metaKwh),
      realizadoComparavelP50Kwh: p50.realizadoKwh,
      realizadoComparavelP90Kwh: p90.realizadoKwh,
      prPct: energiaTeorica && energiaTeorica > 0 && energiaPareada !== null ? Number(((100 * energiaPareada) / energiaTeorica).toFixed(4)) : null,
      rendimentoKwhKwp: calcularRE(soma(comRealizado.map((x) => x.g.energiaBrutaKwh)), soma(comRealizado.map((x) => x.usina.potenciaDcKwp))),
    },
    usinasSemRealizado: porUsina.filter((x) => x.g.energiaBrutaKwh === null).map((x) => x.usina.nome),
    usinasSemPrevista: porUsina.filter((x) => x.g.geracaoPrevistaPeriodoKwh === null).map((x) => x.usina.nome),
    graficoDiario,
    usinas: porUsina.map((x) => ({
      id: x.usina.id,
      nome: x.usina.nome,
      potenciaDcKwp: x.usina.potenciaDcKwp,
      realizadoKwh: x.g.energiaBrutaKwh,
      previstaKwh: x.g.geracaoPrevistaPeriodoKwh,
      aderenciaPrevistaPct: calcularAderencia(x.g.energiaBrutaKwh, x.g.geracaoPrevistaPeriodoKwh),
      prPct: x.pr.prPct,
      rendimentoKwhKwp: calcularRE(x.g.energiaBrutaKwh, x.usina.potenciaDcKwp),
    })),
  });
});

router.get("/usinas/:usinaId/indicadores", exigirPermissao("painel", "visualizar"), async (req, res) => {
  const { inicio, fim, mesesCobertos } = resolverPeriodo(req.query);
  const indicadores = await calcularIndicadoresUsina(req.params.usinaId, inicio, fim, mesesCobertos);
  if (!indicadores) return res.status(404).json({ erro: "Usina não encontrada." });
  const { _energiaTeoricaKwh, ...resto } = indicadores;
  res.json({ periodo: { inicio, fim }, ...resto, avisoIndicadoresPendentes: AVISO_INDICADORES_PENDENTES });
});

export default router;
