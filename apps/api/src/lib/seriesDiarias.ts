import { prisma } from "./prisma";

function chaveDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/// Irradiação representativa por dia, no nível pedido:
/// - skidId informado: leituras daquele SKID; sem leitura própria, cai para a "geral" da usina
///   naquele dia (nunca mistura SKIDs entre si nesse caso).
/// - skidId omitido (nível da usina): prioriza a leitura "geral" (skidId nulo); na ausência, usa a
///   média das leituras por SKID daquele dia. Decisão de placeholder — ver
///   docs/DECISOES_PLACEHOLDER.md ("fonte de irradiação representativa" é ponto pendente do PDF).
export async function irradiacaoRepresentativaPorDia(
  usinaId: string,
  inicio: Date,
  fim: Date,
  skidId?: string
): Promise<Map<string, number>> {
  const todas = await prisma.lancamentoIrradiacaoDiaria.findMany({
    where: { usinaId, data: { gte: inicio, lte: fim } },
    select: { data: true, skidId: true, irradiacaoKwhM2: true },
  });

  const geralPorDia = new Map<string, number>();
  const skidPorDia = new Map<string, number[]>();
  const doSkidPedidoPorDia = new Map<string, number>();

  for (const l of todas) {
    const chave = chaveDia(l.data);
    if (l.skidId === null) {
      geralPorDia.set(chave, l.irradiacaoKwhM2);
    } else {
      if (!skidPorDia.has(chave)) skidPorDia.set(chave, []);
      skidPorDia.get(chave)!.push(l.irradiacaoKwhM2);
      if (skidId && l.skidId === skidId) doSkidPedidoPorDia.set(chave, l.irradiacaoKwhM2);
    }
  }

  if (skidId) {
    const resultado = new Map<string, number>(doSkidPedidoPorDia);
    for (const [chave, valor] of geralPorDia) if (!resultado.has(chave)) resultado.set(chave, valor);
    return resultado;
  }

  const resultado = new Map<string, number>(geralPorDia);
  for (const [chave, valores] of skidPorDia) {
    if (!resultado.has(chave)) resultado.set(chave, valores.reduce((a, b) => a + b, 0) / valores.length);
  }
  return resultado;
}

/// Geração diária somada, filtrada por SKID e/ou inversor. skidId/inversorId omitidos = total da
/// usina (Σ inversores, nunca somando também leituras de medição própria no mesmo total).
export async function geracaoPorDia(
  usinaId: string,
  inicio: Date,
  fim: Date,
  filtro: { skidId?: string; inversorId?: string } = {}
): Promise<Map<string, number>> {
  const linhas = await prisma.lancamentoGeracaoDiaria.groupBy({
    by: ["data"],
    where: {
      usinaId,
      data: { gte: inicio, lte: fim },
      inversorId: filtro.inversorId ?? { not: null },
      ...(filtro.skidId ? { skidId: filtro.skidId } : {}),
    },
    _sum: { energiaKwh: true },
  });
  const resultado = new Map<string, number>();
  for (const l of linhas) {
    if (l._sum.energiaKwh !== null) resultado.set(chaveDia(l.data), l._sum.energiaKwh);
  }
  return resultado;
}

export interface PrDiaResultado {
  porDia: { data: string; prPct: number | null }[];
  agregado: { prPct: number | null; dias: number; energiaRealizadaKwh: number | null; energiaTeoricaKwh: number | null };
}

/// PR pareado dia a dia: só entram no agregado os dias com geração E irradiação disponíveis —
/// nunca somar geração de um período contra irradiação de cobertura diferente (isso infla ou
/// reduz o PR artificialmente; bug real corrigido na Fase 4 ao validar com dados reais).
export function calcularPrDiarioPareado(
  geracao: Map<string, number>,
  irradiacao: Map<string, number>,
  potenciaKwp: number | null | undefined
): PrDiaResultado {
  const datas = [...new Set([...geracao.keys()])].sort();
  const porDia: { data: string; prPct: number | null }[] = [];
  let energiaRealizadaKwh = 0;
  let energiaTeoricaKwh = 0;
  let dias = 0;

  for (const data of datas) {
    const energia = geracao.get(data)!;
    const irradiacaoDia = irradiacao.get(data);
    if (!potenciaKwp || potenciaKwp <= 0 || irradiacaoDia === undefined || irradiacaoDia <= 0) {
      porDia.push({ data, prPct: null });
      continue;
    }
    const teoricaDia = potenciaKwp * irradiacaoDia;
    porDia.push({ data, prPct: Number(((100 * energia) / teoricaDia).toFixed(4)) });
    energiaRealizadaKwh += energia;
    energiaTeoricaKwh += teoricaDia;
    dias++;
  }

  const prPct = dias > 0 && energiaTeoricaKwh > 0 ? Number(((100 * energiaRealizadaKwh) / energiaTeoricaKwh).toFixed(4)) : null;

  return {
    porDia,
    agregado: {
      prPct,
      dias,
      energiaRealizadaKwh: dias > 0 ? energiaRealizadaKwh : null,
      energiaTeoricaKwh: dias > 0 ? energiaTeoricaKwh : null,
    },
  };
}
