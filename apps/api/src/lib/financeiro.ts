import { prisma } from "./prisma";

// Custo de O&M — duas origens somadas, nunca duplicadas: peças consumidas do estoque (custo
// reconhecido no consumo, não na compra) e lançamentos manuais por categoria. Extraído para ser
// reaproveitado tanto por GET /financeiro/resumo quanto pelo snapshot de Relatórios (Fase 8).

const CATEGORIAS = ["MAO_DE_OBRA", "SERVICO_TERCEIRIZADO", "PECAS_AVULSAS", "OUTROS"] as const;

export interface ResumoFinanceiro {
  custoTotal: number;
  custoPorKwp: number | null;
  consumoSemCustoApurado: number;
  custoPorCategoria: Record<string, number>;
  serieMensal: { mes: string; valor: number }[];
}

export async function calcularResumoFinanceiro(usinaId: string, potenciaDcKwp: number, inicio: Date, fim: Date): Promise<ResumoFinanceiro> {
  // "fim" chega como o dia inteiro (sem hora) — MovimentacaoEstoque.criadoEm é um instante, então a
  // janela precisa ir até o início do dia seguinte (mesma convenção de usinas/disponibilidade.routes.ts).
  const fimInclusivo = new Date(fim.getTime() + 86_400_000);

  const [movimentacoesSaida, lancamentos] = await Promise.all([
    prisma.movimentacaoEstoque.findMany({
      where: { usinaId, tipo: "SAIDA", criadoEm: { gte: inicio, lt: fimInclusivo } },
      select: { quantidade: true, custoUnitario: true, criadoEm: true },
    }),
    prisma.lancamentoFinanceiro.findMany({ where: { usinaId, data: { gte: inicio, lte: fim } } }),
  ]);

  const movimentacoesComCusto = movimentacoesSaida.filter((m) => m.custoUnitario !== null);
  const custoPecasEstoque = movimentacoesComCusto.reduce((s, m) => s + m.quantidade * m.custoUnitario!, 0);
  const consumoSemCustoApurado = movimentacoesSaida.length - movimentacoesComCusto.length;

  const custoPorCategoria: Record<string, number> = { PECAS_ESTOQUE: custoPecasEstoque };
  for (const cat of CATEGORIAS) custoPorCategoria[cat] = 0;
  for (const l of lancamentos) custoPorCategoria[l.categoria] = (custoPorCategoria[l.categoria] ?? 0) + l.valor;

  const custoTotal = Object.values(custoPorCategoria).reduce((s, v) => s + v, 0);
  const custoPorKwp = potenciaDcKwp > 0 ? Number((custoTotal / potenciaDcKwp).toFixed(2)) : null;

  const serieMensal = new Map<string, number>();
  for (const m of movimentacoesComCusto) {
    const chave = m.criadoEm.toISOString().slice(0, 7);
    serieMensal.set(chave, (serieMensal.get(chave) ?? 0) + m.quantidade * m.custoUnitario!);
  }
  for (const l of lancamentos) {
    const chave = l.data.toISOString().slice(0, 7);
    serieMensal.set(chave, (serieMensal.get(chave) ?? 0) + l.valor);
  }

  return {
    custoTotal: Number(custoTotal.toFixed(2)),
    custoPorKwp,
    consumoSemCustoApurado,
    custoPorCategoria,
    serieMensal: [...serieMensal.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, valor]) => ({ mes, valor: Number(valor.toFixed(2)) })),
  };
}
