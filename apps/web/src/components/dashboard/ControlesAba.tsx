import { api } from "../../api/client";

interface Props {
  inicio: string;
  fim: string;
  onAlterarIntervalo: (inicio: string, fim: string) => void;
  usinaId: string;
  rotaReprocessar: string;
  ultimoProcessamento: { data: string; usuario: string | null } | null;
  onReprocessado?: () => void;
}

/// Controles compartilhados pelas abas do Dashboard individual: intervalo de datas, Reprocessar
/// (idempotente) e "Último processamento" — conforme a especificação (Geração Bruta/PR/FC).
export function ControlesAba({ inicio, fim, onAlterarIntervalo, usinaId, rotaReprocessar, ultimoProcessamento, onReprocessado }: Props) {
  async function reprocessar() {
    await api.post(rotaReprocessar.replace(":usinaId", usinaId));
    onReprocessado?.();
  }

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4 bg-white border border-slate-200 rounded-lg p-4">
      <div>
        <label className="block text-xs text-os-azul-marinho mb-1">Início</label>
        <input type="date" value={inicio} onChange={(e) => onAlterarIntervalo(e.target.value, fim)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-xs text-os-azul-marinho mb-1">Fim</label>
        <input type="date" value={fim} onChange={(e) => onAlterarIntervalo(inicio, e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
      </div>
      <button onClick={reprocessar} className="border border-os-azul-marinho text-os-azul-marinho rounded-md px-3 py-1.5 text-sm hover:bg-os-azul-marinho hover:text-white transition-colors">
        Reprocessar
      </button>
      <span className="text-os-cinza text-xs ml-auto">
        {ultimoProcessamento
          ? `Último processamento: ${new Date(ultimoProcessamento.data).toLocaleString("pt-BR")}${ultimoProcessamento.usuario ? ` · ${ultimoProcessamento.usuario}` : ""}`
          : "Ainda não processado."}
      </span>
    </div>
  );
}
