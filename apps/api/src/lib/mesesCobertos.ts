// Identifica quais meses do calendário estão INTEIRAMENTE contidos num intervalo de datas — usado
// para decidir quais meses de PrevisaoMensal entram numa meta agregada. "Se o estudo só contém
// metas mensais, não calcular silenciosamente metas diárias ou de mês incompleto" (especificação).

export interface MesCoberto {
  ano: number;
  mes: number;
}

function ultimoDiaDoMes(ano: number, mesIndex0: number): Date {
  return new Date(Date.UTC(ano, mesIndex0 + 1, 0));
}

export function mesesInteiramenteCobertos(inicio: Date, fim: Date): MesCoberto[] {
  const meses: MesCoberto[] = [];
  const cursor = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), 1));
  while (cursor <= fim) {
    const ano = cursor.getUTCFullYear();
    const mesIndex0 = cursor.getUTCMonth();
    const primeiroDia = new Date(Date.UTC(ano, mesIndex0, 1));
    const fimDoMes = ultimoDiaDoMes(ano, mesIndex0);
    if (primeiroDia >= inicio && fimDoMes <= fim) {
      meses.push({ ano, mes: mesIndex0 + 1 });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return meses;
}
