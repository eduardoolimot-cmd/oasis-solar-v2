// Resolve o período (data início/fim, inclusive) a partir dos filtros da barra superior — ver
// FiltrosContext no frontend. "Ano completo" agrega o ano inteiro; nunca mistura o mesmo mês de
// anos diferentes.

export interface Periodo {
  inicio: Date;
  fim: Date; // inclusive
  mesesCobertos: { ano: number; mes: number }[];
}

function utc(ano: number, mesIndex0: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesIndex0, dia));
}

export function resolverPeriodo(query: {
  ano?: unknown;
  modo?: unknown;
  mes?: unknown;
  inicio?: unknown;
  fim?: unknown;
}): Periodo {
  const anoAtual = new Date().getFullYear();
  const ano = Number(query.ano) || anoAtual;
  const modo = String(query.modo || "ano_completo");

  if (modo === "intervalo" && query.inicio && query.fim) {
    const inicio = new Date(String(query.inicio));
    const fim = new Date(String(query.fim));
    const mesesCobertos: { ano: number; mes: number }[] = [];
    const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
    while (cursor <= fim) {
      mesesCobertos.push({ ano: cursor.getUTCFullYear(), mes: cursor.getUTCMonth() + 1 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { inicio, fim, mesesCobertos };
  }

  if (modo === "mes") {
    const mes = Number(query.mes) || new Date().getMonth() + 1;
    const inicio = utc(ano, mes - 1, 1);
    const fim = utc(ano, mes, 0); // último dia do mês
    return { inicio, fim, mesesCobertos: [{ ano, mes }] };
  }

  // ano_completo (padrão)
  const inicio = utc(ano, 0, 1);
  const fim = utc(ano, 11, 31);
  const mesesCobertos = Array.from({ length: 12 }, (_, i) => ({ ano, mes: i + 1 }));
  return { inicio, fim, mesesCobertos };
}
