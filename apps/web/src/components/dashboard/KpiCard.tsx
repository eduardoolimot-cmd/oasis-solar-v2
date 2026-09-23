import { InfoTooltip } from "./InfoTooltip";

export function fmt(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return "Sem dados";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

interface Props {
  titulo: string;
  valor: string;
  unidade?: string;
  /// Explicação do indicador, exibida ao passar o mouse, focar ou tocar no ícone "i".
  info?: string;
}

export function KpiCard({ titulo, valor, unidade, info }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-os-cinza text-xs">{titulo}</p>
        {info && <InfoTooltip titulo={titulo} texto={info} />}
      </div>
      <p className="text-2xl font-semibold text-os-azul-marinho">
        {valor}
        {unidade && <span className="text-sm text-os-cinza ml-1">{unidade}</span>}
      </p>
    </div>
  );
}
