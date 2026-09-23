import { RadialBar, RadialBarChart } from "recharts";
import { InfoTooltip } from "./InfoTooltip";

interface Props {
  titulo: string;
  aderenciaPct: number | null;
  corPrincipal: string;
  detalheRealizado?: string;
  detalheMeta?: string;
  /// Explicação do indicador, exibida no ícone "i" ao lado do título.
  info?: string;
}

/// Indicador circular de aderência. Valores acima de 100% permanecem visíveis numericamente — o
/// anel apenas satura em 100% (nunca corta o número exibido), conforme a especificação.
export function AderenciaGauge({ titulo, aderenciaPct, corPrincipal, detalheRealizado, detalheMeta, info }: Props) {
  const naoCalculavel = aderenciaPct === null;
  const valorAnel = naoCalculavel ? 0 : Math.min(aderenciaPct, 100);
  const dados = [{ nome: titulo, valor: valorAnel, fill: corPrincipal }];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col items-center">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <p className="text-os-cinza text-xs">{titulo}</p>
        {info && <InfoTooltip titulo={titulo} texto={info} alinhamento="centro" />}
      </div>
      <div className="relative w-[140px] h-[140px]">
        <RadialBarChart width={140} height={140} innerRadius="70%" outerRadius="100%" data={dados} startAngle={90} endAngle={-270}>
          <RadialBar dataKey="valor" background={{ fill: "#EEF2F6" }} cornerRadius={8} max={100} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-os-azul-marinho">{naoCalculavel ? "—" : `${aderenciaPct.toFixed(1)}%`}</span>
          {aderenciaPct !== null && aderenciaPct > 100 && <span className="text-[10px] text-os-laranja">Acima da meta</span>}
        </div>
      </div>
      {naoCalculavel ? (
        <p className="text-os-cinza text-xs mt-1">Não calculável</p>
      ) : (
        <p className="text-os-cinza text-xs mt-1 text-center">
          {detalheRealizado}
          {detalheMeta && <><br />{detalheMeta}</>}
        </p>
      )}
    </div>
  );
}
