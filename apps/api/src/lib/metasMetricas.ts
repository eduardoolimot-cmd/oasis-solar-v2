// Mapeamento das linhas da matriz "Metas mensais" (especificação, Cadastro · Metas mensais):
// 2 de energia e 2 de disponibilidade. Usado tanto pela grade da tela quanto pela
// exportação/importação de Excel — "Reconhecer linhas pelo identificador da métrica, não pela
// posição isolada".

export type ChaveMetrica =
  | "geracaoP50Kwh"
  | "geracaoP90Kwh"
  | "dispGeracaoMetaPct"
  | "dispComunicacaoMetaPct";

export interface DefinicaoMetrica {
  chave: ChaveMetrica;
  rotulo: string;
  unidade: string;
  calculada: boolean;
}

export const METRICAS: DefinicaoMetrica[] = [
  { chave: "geracaoP50Kwh", rotulo: "Geração bruta P50", unidade: "kWh/mês", calculada: false },
  { chave: "geracaoP90Kwh", rotulo: "Geração bruta P90", unidade: "kWh/mês", calculada: false },
  { chave: "dispGeracaoMetaPct", rotulo: "Disponibilidade de geração (meta)", unidade: "%", calculada: false },
  { chave: "dispComunicacaoMetaPct", rotulo: "Disponibilidade de comunicação (meta)", unidade: "%", calculada: false },
];

export const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/// Normaliza um rótulo para comparação tolerante (sem acento, minúsculo, sem espaços/pontuação
/// extras) — permite reconhecer a linha mesmo com pequenas variações de digitação na planilha.
export function normalizarRotulo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDICE_ROTULOS: Map<string, ChaveMetrica> = new Map(
  METRICAS.map((m) => [normalizarRotulo(m.rotulo), m.chave])
);

export function encontrarMetricaPorRotulo(rotulo: string): ChaveMetrica | null {
  return INDICE_ROTULOS.get(normalizarRotulo(rotulo)) ?? null;
}
