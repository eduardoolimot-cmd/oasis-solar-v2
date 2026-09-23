/// Formata uma data-apenas (sem hora — ex.: data de lançamento, data prevista, início de
/// operação) para pt-BR. Sempre usar isto, nunca `new Date(iso).toLocaleDateString()` puro: campos
/// "data" são armazenados como meia-noite UTC, e formatar no fuso local desloca um dia para trás
/// em qualquer fuso atrás de UTC (ex.: América/São Paulo, UTC-3) — 2026-09-12 vira "11/09/2026".
/// `timeZone: "UTC"` faz a formatação usar os mesmos componentes de data que foram armazenados.
export function formatarDataBr(iso: string, opcoes?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", ...opcoes });
}
