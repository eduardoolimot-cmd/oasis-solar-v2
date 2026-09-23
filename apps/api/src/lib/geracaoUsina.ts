// Cálculo de geração de uma usina num período (realizado, previsto PVsyst diário, metas P50/P90) —
// fonte única usada pela aba "Geração de Energia Bruta" (usinas/geracaoBruta.routes.ts) e pela
// visão consolidada "Todas as usinas" do Painel Principal (painel/painel.routes.ts), para que o
// total da carteira seja exatamente a soma do que cada usina mostra individualmente.

import { carregarCurvaDegradacao, fatorDegradacao, fatorDegradacaoAnual, type CurvaDegradacao } from "./degradacao";
import { mesesInteiramenteCobertos } from "./mesesCobertos";
import { prisma } from "./prisma";

export interface GeracaoUsinaPeriodo {
  curvaDegradacao: CurvaDegradacao | null;
  mesesDoPeriodo: { ano: number; mes: number }[];
  mesesCobertos: { ano: number; mes: number }[];
  mesesComMetaP50: number;
  /// Σ inversores no período; null se não há nenhum lançamento.
  energiaBrutaKwh: number | null;
  /// Metas P50/P90 (só meses inteiramente cobertos, ajustadas pela degradação); null sem meta.
  p50Kwh: number | null;
  p90Kwh: number | null;
  /// Energia realizada por dia (Σ inversores).
  energiaPorDia: Map<string, number>;
  /// Geração prevista PVsyst por dia (mês ÷ dias do mês, ajustada pela degradação) — só dias de
  /// meses com previsão cadastrada.
  geracaoPrevistaPorDia: Map<string, number>;
  /// Geração prevista do período: só existe se TODOS os dias do período têm previsão.
  geracaoPrevistaPeriodoKwh: number | null;
}

function diasNoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function diasDoPeriodo(inicio: Date, fim: Date): string[] {
  const dias: string[] = [];
  for (const cursor = new Date(inicio); cursor <= fim; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dias.push(cursor.toISOString().slice(0, 10));
  }
  return dias;
}

export async function calcularGeracaoUsina(usinaId: string, inicio: Date, fim: Date): Promise<GeracaoUsinaPeriodo> {
  const mesesCobertos = mesesInteiramenteCobertos(inicio, fim);
  const mesesDoPeriodo: { ano: number; mes: number }[] = [];
  for (const c = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1)); c <= fim; c.setUTCMonth(c.getUTCMonth() + 1)) {
    mesesDoPeriodo.push({ ano: c.getUTCFullYear(), mes: c.getUTCMonth() + 1 });
  }

  const [totalRealizado, geracaoDiariaRaw, previsoesMeta, previsoesPvsyst, curvaDegradacao] = await Promise.all([
    prisma.lancamentoGeracaoDiaria.aggregate({
      where: { usinaId, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
      _sum: { energiaKwh: true },
      _count: { _all: true },
    }),
    prisma.lancamentoGeracaoDiaria.groupBy({
      by: ["data"],
      where: { usinaId, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
      _sum: { energiaKwh: true },
    }),
    // KPIs de meta: só meses inteiramente cobertos pelo intervalo entram, para não ratear/inventar
    // meta de mês parcial.
    mesesCobertos.length
      ? prisma.previsaoMensal.findMany({
          where: { usinaId, ativo: true, OR: mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes })) },
          select: { ano: true, mes: true, geracaoP50Kwh: true, geracaoP90Kwh: true },
        })
      : Promise.resolve([]),
    // Geração prevista PVsyst: todo mês que o período toca (mês parcial = proporcional aos dias).
    prisma.previsaoMensal.findMany({
      where: { usinaId, ativo: true, OR: mesesDoPeriodo.map((m) => ({ ano: m.ano, mes: m.mes })) },
      select: { ano: true, mes: true, geracaoPrevistaKwh: true },
    }),
    carregarCurvaDegradacao(usinaId),
  ]);

  const energiaBrutaKwh = totalRealizado._count._all > 0 ? totalRealizado._sum.energiaKwh! : null;

  const mesesComP50 = previsoesMeta.filter((p) => p.geracaoP50Kwh !== null);
  const mesesComP90 = previsoesMeta.filter((p) => p.geracaoP90Kwh !== null);
  let p50Kwh = mesesComP50.length ? mesesComP50.reduce((s, p) => s + p.geracaoP50Kwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0) : null;
  let p90Kwh = mesesComP90.length ? mesesComP90.reduce((s, p) => s + p.geracaoP90Kwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0) : null;

  // Recorte = um ano civil inteiro sem P50/P90 mensal (estudo só forneceu o cenário anual — regra
  // da especificação: não ratear): usa o cenário anual diretamente.
  const anoCivilInteiro =
    inicio.getUTCMonth() === 0 && inicio.getUTCDate() === 1 && fim.getUTCMonth() === 11 && fim.getUTCDate() === 31 && inicio.getUTCFullYear() === fim.getUTCFullYear();
  if (anoCivilInteiro && (p50Kwh === null || p90Kwh === null)) {
    const anual = await prisma.previsaoAnual.findFirst({ where: { usinaId, ano: inicio.getUTCFullYear(), ativo: true } });
    if (anual) {
      const fatorAno = fatorDegradacaoAnual(curvaDegradacao, inicio.getUTCFullYear());
      if (p50Kwh === null && anual.geracaoP50Kwh !== null) p50Kwh = anual.geracaoP50Kwh * fatorAno;
      if (p90Kwh === null && anual.geracaoP90Kwh !== null) p90Kwh = anual.geracaoP90Kwh * fatorAno;
    }
  }

  const previstaPorMes = new Map(
    previsoesPvsyst
      .filter((p) => p.geracaoPrevistaKwh !== null)
      .map((p) => [`${p.ano}-${String(p.mes).padStart(2, "0")}`, (p.geracaoPrevistaKwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes)) / diasNoMes(p.ano, p.mes)])
  );

  const energiaPorDia = new Map<string, number>();
  for (const g of geracaoDiariaRaw) if (g._sum.energiaKwh !== null) energiaPorDia.set(g.data.toISOString().slice(0, 10), g._sum.energiaKwh);

  const dias = diasDoPeriodo(inicio, fim);
  const geracaoPrevistaPorDia = new Map<string, number>();
  for (const dia of dias) {
    const valor = previstaPorMes.get(dia.slice(0, 7));
    if (valor !== undefined) geracaoPrevistaPorDia.set(dia, valor);
  }
  const geracaoPrevistaPeriodoKwh =
    dias.length > 0 && dias.every((d) => geracaoPrevistaPorDia.has(d)) ? dias.reduce((s, d) => s + geracaoPrevistaPorDia.get(d)!, 0) : null;

  return {
    curvaDegradacao,
    mesesDoPeriodo,
    mesesCobertos,
    mesesComMetaP50: mesesComP50.length,
    energiaBrutaKwh,
    p50Kwh,
    p90Kwh,
    energiaPorDia,
    geracaoPrevistaPorDia,
    geracaoPrevistaPeriodoKwh,
  };
}
