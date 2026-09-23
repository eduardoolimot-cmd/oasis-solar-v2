// Indicadores de desempenho (Painel Principal / abas do Dashboard). Regra crítica da
// especificação: nunca somar/mediar percentuais diretamente — sempre agregar por soma de
// numeradores/denominadores compatíveis e calcular o percentual uma única vez, no final.

export const G_REF_KW_M2 = 1; // irradiância de referência (PVsyst / especificação)

/// PR simples (%) = 100 × E_AC / [P_DC × (H_POA / G_ref)]. Retorna null quando não calculável
/// (irradiação ausente ou não positiva, ou potência ausente/zero) — nunca 0 nem divisão por zero.
export function calcularPR(
  energiaRealizadaKwh: number | null | undefined,
  potenciaDcKwp: number | null | undefined,
  irradiacaoPoaKwhM2: number | null | undefined
): number | null {
  if (energiaRealizadaKwh === null || energiaRealizadaKwh === undefined) return null;
  if (!potenciaDcKwp || potenciaDcKwp <= 0) return null;
  if (!irradiacaoPoaKwhM2 || irradiacaoPoaKwhM2 <= 0) return null;
  const energiaTeoricaKwh = potenciaDcKwp * (irradiacaoPoaKwhM2 / G_REF_KW_M2);
  if (energiaTeoricaKwh <= 0) return null;
  return Number(((100 * energiaRealizadaKwh) / energiaTeoricaKwh).toFixed(4));
}

/// IPE (%) = 100 × energia realizada / energia prevista, mesmo período e ponto de medição.
export function calcularIPE(
  energiaRealizadaKwh: number | null | undefined,
  energiaPrevistaKwh: number | null | undefined
): number | null {
  if (energiaRealizadaKwh === null || energiaRealizadaKwh === undefined) return null;
  if (!energiaPrevistaKwh || energiaPrevistaKwh <= 0) return null;
  return Number(((100 * energiaRealizadaKwh) / energiaPrevistaKwh).toFixed(4));
}

/// Rendimento específico / yield (kWh/kWp) = energia realizada / potência instalada.
export function calcularRE(
  energiaRealizadaKwh: number | null | undefined,
  potenciaKwp: number | null | undefined
): number | null {
  if (energiaRealizadaKwh === null || energiaRealizadaKwh === undefined) return null;
  if (!potenciaKwp || potenciaKwp <= 0) return null;
  return Number((energiaRealizadaKwh / potenciaKwp).toFixed(4));
}

/// Aderência (%) = 100 × realizado / meta. "Não calculável" (null) quando a meta é zero ou
/// ausente — nunca inventar aderência. Valores acima de 100% permanecem visíveis (sem teto).
export function calcularAderencia(
  realizado: number | null | undefined,
  meta: number | null | undefined
): number | null {
  if (realizado === null || realizado === undefined) return null;
  if (!meta || meta <= 0) return null;
  return Number(((100 * realizado) / meta).toFixed(4));
}
