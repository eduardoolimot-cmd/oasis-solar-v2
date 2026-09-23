export interface ResumoDegradacao {
  anoOperacaoInicio: number;
  anoOperacaoFim: number;
  reducaoMediaPct: number;
}

/// Aviso de transparência: informa se as previsões de energia (E_Grid, P50, P90 e meta de FC)
/// estão ajustadas pela degradação esperada cadastrada na usina.
export function NotaDegradacao({ degradacao }: { degradacao: ResumoDegradacao | null }) {
  if (!degradacao) {
    return <p className="text-os-cinza text-xs mb-3">Sem curva de degradação cadastrada para esta usina: as previsões de energia seguem o PVsyst (ano 0), sem ajuste.</p>;
  }
  const anos = degradacao.anoOperacaoInicio === degradacao.anoOperacaoFim ? `ano ${degradacao.anoOperacaoInicio}` : `anos ${degradacao.anoOperacaoInicio} a ${degradacao.anoOperacaoFim}`;
  return (
    <p className="text-os-cinza text-xs mb-3">
      Previsões de energia ajustadas pela degradação esperada ({anos} de operação; redução média de {degradacao.reducaoMediaPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% sobre o PVsyst ano 0{degradacao.anoOperacaoInicio === 0 ? "; ano 0 = antes da data-base, sem degradação" : ""}).
    </p>
  );
}
