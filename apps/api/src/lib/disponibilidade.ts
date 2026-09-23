// Disponibilidade / MTTR / MTBF — calculados a partir de EventoOperacional (Fase 6). "Ausência de
// falhas" é diferente de "sem eventos cadastrados": só calculamos um percentual de disponibilidade
// quando já existe pelo menos um evento histórico daquele tipo para a usina (ver rota); dentro
// desta função assumimos que essa checagem já foi feita e trabalhamos apenas com a janela.

export interface EventoParaCalculo {
  inicio: Date;
  fim: Date | null;
}

/// % do tempo da janela em que NÃO houve sobreposição com nenhum evento (parada). Eventos sem
/// "fim" (em andamento) contam como indisponíveis até o momento atual, nunca presumidos encerrados.
export function calcularDisponibilidadePct(eventos: EventoParaCalculo[], inicioJanela: Date, fimJanela: Date): number | null {
  const duracaoJanelaMs = fimJanela.getTime() - inicioJanela.getTime();
  if (duracaoJanelaMs <= 0) return null;

  const agora = new Date();
  let indisponivelMs = 0;
  for (const e of eventos) {
    const inicioEv = Math.max(e.inicio.getTime(), inicioJanela.getTime());
    const fimEv = Math.min((e.fim ?? agora).getTime(), fimJanela.getTime());
    if (fimEv > inicioEv) indisponivelMs += fimEv - inicioEv;
  }
  const pct = 100 * (1 - indisponivelMs / duracaoJanelaMs);
  return Number(Math.max(0, Math.min(100, pct)).toFixed(2));
}

/// MTTR (Mean Time To Repair, em horas) — média da duração dos eventos já encerrados no período.
/// Sem evento encerrado no período: não calculável (nunca 0h, que sugeriria reparo instantâneo).
export function calcularMttrHoras(eventosEncerrados: { inicio: Date; fim: Date }[]): number | null {
  if (eventosEncerrados.length === 0) return null;
  const totalMs = eventosEncerrados.reduce((s, e) => s + (e.fim.getTime() - e.inicio.getTime()), 0);
  return Number((totalMs / eventosEncerrados.length / 3_600_000).toFixed(2));
}

/// MTBF (Mean Time Between Failures, em horas) — tempo médio disponível entre falhas encerradas na
/// janela: (duração da janela − tempo indisponível) / nº de falhas. Sem falha encerrada no
/// período: não calculável (nunca infinito nem 0h).
export function calcularMtbfHoras(eventosEncerrados: { inicio: Date; fim: Date }[], inicioJanela: Date, fimJanela: Date): number | null {
  if (eventosEncerrados.length === 0) return null;
  const duracaoJanelaMs = fimJanela.getTime() - inicioJanela.getTime();
  if (duracaoJanelaMs <= 0) return null;
  const indisponivelMs = eventosEncerrados.reduce((s, e) => s + (e.fim.getTime() - e.inicio.getTime()), 0);
  const disponivelMs = Math.max(0, duracaoJanelaMs - indisponivelMs);
  return Number((disponivelMs / eventosEncerrados.length / 3_600_000).toFixed(2));
}
