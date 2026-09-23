// Aplicação da degradação esperada às PREVISÕES DE ENERGIA (geração prevista/E_Grid, P50, P90 e,
// por derivação, a meta de FC). Premissa confirmada: as simulações PVsyst importadas são do ANO 0
// (módulos novos, ainda sem degradação). O valor guardado no banco continua sendo o do PVsyst
// (nunca é reescrito — "não alterar automaticamente previsões já salvas"); o ajuste é feito na
// leitura, com a retenção da curva cadastrada aplicada diretamente:
//
//   fator(n) = Retenção(n) / 100,  Retenção(n) = 100 − perdaPrimeiroAno − (n−1) × perdaAnual  (n ≥ 1)
//   fator(0) = 1 (antes da data-base: sem degradação)
//
// n = ano de operação do mês, contado a partir da data-base da curva (Cadastro · Degradação
// esperada), pelo dia 15 do mês. Sem curva cadastrada não há ajuste (fator 1) — nada é presumido.
// Irradiação prevista e PR previsto NÃO são degradados.

import { prisma } from "./prisma";

export interface CurvaDegradacao {
  perdaPrimeiroAnoPct: number;
  perdaAnualConstantePct: number;
  dataBase: Date;
}

export async function carregarCurvaDegradacao(usinaId: string): Promise<CurvaDegradacao | null> {
  const ativa = await prisma.degradacao.findFirst({
    where: { usinaId, ativo: true },
    select: { perdaPrimeiroAnoPct: true, perdaAnualConstantePct: true, dataBase: true },
  });
  return ativa;
}

/// Ano de operação (1, 2, 3…) do mês, pelo dia 15, contado a partir da data-base (aniversário no
/// mesmo dia/mês da data-base). 0 = mês anterior à data-base (ainda sem degradação).
export function anoDeOperacao(curva: CurvaDegradacao, ano: number, mes: number): number {
  const base = curva.dataBase;
  let n = ano - base.getUTCFullYear();
  const antesDoAniversario = mes - 1 < base.getUTCMonth() || (mes - 1 === base.getUTCMonth() && 15 < base.getUTCDate());
  if (antesDoAniversario) n -= 1;
  return n < 0 ? 0 : n + 1;
}

/// Fator multiplicativo (≤ 1) sobre a previsão de energia do mês (PVsyst ano 0); 1 sem curva.
export function fatorDegradacao(curva: CurvaDegradacao | null, ano: number, mes: number): number {
  if (!curva) return 1;
  const n = anoDeOperacao(curva, ano, mes);
  if (n === 0) return 1;
  const retencaoN = Math.max(0, 100 - curva.perdaPrimeiroAnoPct - (n - 1) * curva.perdaAnualConstantePct);
  return retencaoN / 100;
}

/// Fator médio do ano civil (para cenários anuais sem abertura mensal).
export function fatorDegradacaoAnual(curva: CurvaDegradacao | null, ano: number): number {
  if (!curva) return 1;
  let soma = 0;
  for (let mes = 1; mes <= 12; mes++) soma += fatorDegradacao(curva, ano, mes);
  return soma / 12;
}

/// Resumo para exibir na tela: anos de operação cobertos e redução média das previsões no período.
export interface ResumoDegradacao {
  anoOperacaoInicio: number;
  anoOperacaoFim: number;
  reducaoMediaPct: number;
}

/// Meses (ano/mês) que o período [inicio, fim] toca, inteiros ou não.
export function mesesTocadosPeloPeriodo(inicio: Date, fim: Date): { ano: number; mes: number }[] {
  const meses: { ano: number; mes: number }[] = [];
  for (const c = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1)); c <= fim; c.setUTCMonth(c.getUTCMonth() + 1)) {
    meses.push({ ano: c.getUTCFullYear(), mes: c.getUTCMonth() + 1 });
  }
  return meses;
}

export function resumirDegradacao(curva: CurvaDegradacao | null, meses: { ano: number; mes: number }[]): ResumoDegradacao | null {
  if (!curva || meses.length === 0) return null;
  const anos = meses.map((m) => anoDeOperacao(curva, m.ano, m.mes));
  const fatores = meses.map((m) => fatorDegradacao(curva, m.ano, m.mes));
  return {
    anoOperacaoInicio: Math.min(...anos),
    anoOperacaoFim: Math.max(...anos),
    reducaoMediaPct: Number(((1 - fatores.reduce((s, f) => s + f, 0) / fatores.length) * 100).toFixed(2)),
  };
}
