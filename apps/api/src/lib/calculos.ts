// Cálculos compartilhados do Cadastro de Usinas (Fase 2). Fórmulas conforme a especificação —
// ver docs/DECISOES_PLACEHOLDER.md para as decisões tomadas nos pontos "a definir".

/// Retenção linear por ano, conforme "Cadastro · Degradação esperada":
/// Retenção(n) = 100 - perdaPrimeiroAno - (n-1) × perdaAnualConstante, para n = 1..anos.
/// Retorna null a partir do ano em que a retenção ficaria negativa (cenário bloqueado no cadastro,
/// mas ainda assim relevante para a prévia mostrar onde o modelo deixa de fazer sentido).
export function calcularRetencaoDegradacao(
  perdaPrimeiroAnoPct: number,
  perdaAnualConstantePct: number,
  anos = 30
): (number | null)[] {
  const resultado: (number | null)[] = [];
  for (let n = 1; n <= anos; n++) {
    const retencao = 100 - perdaPrimeiroAnoPct - (n - 1) * perdaAnualConstantePct;
    resultado.push(retencao >= 0 ? Number(retencao.toFixed(4)) : null);
  }
  return resultado;
}

/// Verdadeiro se o cenário produzir retenção negativa dentro do horizonte informado — bloqueia o
/// cadastro, conforme "bloquear cenário que produza retenção negativa no horizonte cadastrado".
export function cenarioDegradacaoInvalido(
  perdaPrimeiroAnoPct: number,
  perdaAnualConstantePct: number,
  horizonteAnos = 30
): boolean {
  const ultimaRetencao = 100 - perdaPrimeiroAnoPct - (horizonteAnos - 1) * perdaAnualConstantePct;
  return ultimaRetencao < 0;
}

function diasNoMes(ano: number, mes: number): number {
  // mes: 1-12. Dia 0 do mês seguinte = último dia do mês atual.
  return new Date(ano, mes, 0).getDate();
}

/// Horas do mês no calendário civil (24h/dia), incluindo noite — nunca só horas de sol.
/// Decisão de placeholder: sem tratamento de transição de horário de verão (não vigente no
/// Brasil atualmente); ver docs/DECISOES_PLACEHOLDER.md.
export function horasDoMes(ano: number, mes: number): number {
  return diasNoMes(ano, mes) * 24;
}

/// FC do cenário (%) = 100 × energia prevista (kWh) / [potência CA (MW) × 1000 × horas do mês].
/// Retorna null quando não calculável (potência ausente/zero ou energia ausente) — nunca 0 nem
/// divisão por zero silenciosa.
export function calcularFcMensal(
  energiaPrevistaKwh: number | null | undefined,
  potenciaAcMw: number | null | undefined,
  ano: number,
  mes: number
): number | null {
  if (energiaPrevistaKwh === null || energiaPrevistaKwh === undefined) return null;
  if (!potenciaAcMw || potenciaAcMw <= 0) return null;
  const horas = horasDoMes(ano, mes);
  const fc = (100 * energiaPrevistaKwh) / (potenciaAcMw * 1000 * horas);
  return Number(fc.toFixed(4));
}

/// Horas do intervalo civil [inicio, fim] (inclusive, 24h/dia) — "considerar todas as horas do
/// intervalo, inclusive noite e indisponibilidade" (especificação, FC · metodologia).
export function horasDoIntervalo(inicio: Date, fim: Date): number {
  const dias = Math.round((fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return dias * 24;
}

/// FC do período (%) = 100 × energia (kWh) / [potência de referência (kW) × horas do intervalo].
export function calcularFcPeriodo(
  energiaKwh: number | null | undefined,
  potenciaReferenciaKw: number | null | undefined,
  inicio: Date,
  fim: Date
): number | null {
  if (energiaKwh === null || energiaKwh === undefined) return null;
  if (!potenciaReferenciaKw || potenciaReferenciaKw <= 0) return null;
  const horas = horasDoIntervalo(inicio, fim);
  return Number(((100 * energiaKwh) / (potenciaReferenciaKw * horas)).toFixed(4));
}
