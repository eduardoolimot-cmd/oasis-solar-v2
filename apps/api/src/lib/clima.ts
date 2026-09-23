// Previsão/condição do tempo diária — Open-Meteo (https://open-meteo.com), API gratuita e sem
// chave de autenticação. Usa a latitude/longitude cadastradas na usina (Identificação); sem essas
// coordenadas, "não calculável" — nunca presumida uma localização aproximada a partir do
// município, que poderia estar quilômetros longe do ponto real da usina.
//
// Dois endpoints, tentados em sequência:
//  - Forecast API (api.open-meteo.com): cobre previsão futura + passado recente (poucos meses).
//  - Archive API (archive-api.open-meteo.com): dados históricos (reanálise ERA5), para períodos
//    mais antigos que a Forecast API não cobre.
// O primeiro que responder com sucesso é usado; se nenhum cobrir o período (ex.: data futura muito
// distante), o dia fica de fora do resultado, nunca inventado.

export interface DiaClima {
  data: string; // YYYY-MM-DD
  codigoTempo: number; // código WMO original (Open-Meteo)
  categoria: "SOL" | "NUBLADO" | "NEBLINA" | "CHUVA" | "TEMPESTADE";
  rotulo: string;
  precipitacaoMm: number | null;
  temperaturaMaxC: number | null;
  temperaturaMinC: number | null;
}

function categorizarCodigoTempo(codigo: number): { categoria: DiaClima["categoria"]; rotulo: string } {
  if (codigo === 0) return { categoria: "SOL", rotulo: "Céu limpo" };
  if (codigo === 1 || codigo === 2) return { categoria: "SOL", rotulo: "Parcialmente nublado" };
  if (codigo === 3) return { categoria: "NUBLADO", rotulo: "Nublado" };
  if (codigo === 45 || codigo === 48) return { categoria: "NEBLINA", rotulo: "Neblina" };
  if ([51, 53, 55, 56, 57].includes(codigo)) return { categoria: "CHUVA", rotulo: "Garoa" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(codigo)) return { categoria: "CHUVA", rotulo: "Chuva" };
  if ([71, 73, 75, 77, 85, 86].includes(codigo)) return { categoria: "CHUVA", rotulo: "Neve" };
  if ([95, 96, 99].includes(codigo)) return { categoria: "TEMPESTADE", rotulo: "Tempestade" };
  return { categoria: "NUBLADO", rotulo: "Sem classificação" };
}

interface RespostaDiaria {
  daily?: {
    time: string[];
    weathercode: number[];
    precipitation_sum: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
  };
}

function montarDias(resposta: RespostaDiaria): DiaClima[] {
  const diario = resposta.daily;
  if (!diario) return [];
  return diario.time.map((data, i) => {
    const { categoria, rotulo } = categorizarCodigoTempo(diario.weathercode[i]);
    return {
      data,
      codigoTempo: diario.weathercode[i],
      categoria,
      rotulo,
      precipitacaoMm: diario.precipitation_sum[i] ?? null,
      temperaturaMaxC: diario.temperature_2m_max[i] ?? null,
      temperaturaMinC: diario.temperature_2m_min[i] ?? null,
    };
  });
}

async function buscarDe(baseUrl: string, latitude: number, longitude: number, inicio: string, fim: string): Promise<DiaClima[] | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "weathercode,precipitation_sum,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    start_date: inicio,
    end_date: fim,
  });
  try {
    const resposta = await fetch(`${baseUrl}?${params.toString()}`);
    if (!resposta.ok) return null;
    const json = (await resposta.json()) as RespostaDiaria;
    const dias = montarDias(json);
    return dias.length > 0 ? dias : null;
  } catch {
    return null;
  }
}

/// Busca o clima diário (categoria, precipitação, temperaturas) para o intervalo [inicio, fim]
/// (datas puras, YYYY-MM-DD). Combina Forecast + Archive para cobrir o máximo do período possível;
/// dias fora da cobertura de ambas simplesmente não aparecem no resultado.
export async function buscarClimaDiario(latitude: number, longitude: number, inicio: Date, fim: Date): Promise<DiaClima[]> {
  const inicioStr = inicio.toISOString().slice(0, 10);
  const fimStr = fim.toISOString().slice(0, 10);

  const [previsao, historico] = await Promise.all([
    buscarDe("https://api.open-meteo.com/v1/forecast", latitude, longitude, inicioStr, fimStr),
    buscarDe("https://archive-api.open-meteo.com/v1/archive", latitude, longitude, inicioStr, fimStr),
  ]);

  const porData = new Map<string, DiaClima>();
  for (const dia of historico ?? []) porData.set(dia.data, dia);
  for (const dia of previsao ?? []) porData.set(dia.data, dia); // forecast tem prioridade onde há sobreposição (dado mais recente)

  return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
}
