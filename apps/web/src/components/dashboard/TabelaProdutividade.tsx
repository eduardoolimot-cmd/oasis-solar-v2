import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatarDataBr } from "../../lib/formatarData";

interface Dia {
  data: string;
  valores: Record<string, number>;
  maximoKwh: number;
}

interface SkidProdutividade {
  id: string;
  nome: string;
  inversores: { id: string; identificacao: string }[];
  dias: Dia[];
}

// Faixas em relação ao máximo do dia (entre os inversores do mesmo SKID).
const FAIXAS = {
  verde: { minimo: 0.95, classe: "bg-[#1AC4A6] text-white", rotulo: "95–100% do máx. do dia" },
  amarelo: { minimo: 0.9, classe: "bg-[#E3C868] text-white", rotulo: "90–95% do máx. do dia" },
  vermelho: { minimo: 0, classe: "bg-[#F26D6D] text-white", rotulo: "< 90% do máx. do dia" },
};

function faixaDe(razao: number) {
  if (razao >= FAIXAS.verde.minimo) return FAIXAS.verde;
  if (razao >= FAIXAS.amarelo.minimo) return FAIXAS.amarelo;
  return FAIXAS.vermelho;
}

interface Props {
  usinaId: string;
  inicio: string;
  fim: string;
}

export function TabelaProdutividade({ usinaId, inicio, fim }: Props) {
  const [skids, setSkids] = useState<SkidProdutividade[] | null>(null);
  const [skidAtivoId, setSkidAtivoId] = useState<string | null>(null);
  const [modo, setModo] = useState<"reais" | "percentual">("reais");

  useEffect(() => {
    setSkids(null);
    api.get(`/usinas/${usinaId}/produtividade`, { params: { inicio, fim } }).then(({ data }) => {
      setSkids(data.skids);
      setSkidAtivoId((atual) => (data.skids.some((s: SkidProdutividade) => s.id === atual) ? atual : data.skids[0]?.id ?? null));
    });
  }, [usinaId, inicio, fim]);

  const skid = skids?.find((s) => s.id === skidAtivoId) ?? null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-100">
        <h3 className="text-os-azul-marinho font-semibold text-sm">Produtividade{skid ? ` — ${skid.nome}` : ""}</h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-os-cinza">
          <select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white text-os-azul-marinho">
            <option value="reais">Dados reais (kWh)</option>
            <option value="percentual">% do máx. do dia</option>
          </select>
          {Object.values(FAIXAS).map((f) => (
            <span key={f.rotulo} className="flex items-center gap-1.5">
              <span className={`inline-block w-6 h-3 rounded-full ${f.classe.split(" ")[0]}`} />
              {f.rotulo}
            </span>
          ))}
        </div>
      </div>

      {skids && skids.length > 1 && (
        <div className="flex flex-wrap gap-1 px-4 pt-3">
          {skids.map((s) => (
            <button
              key={s.id}
              onClick={() => setSkidAtivoId(s.id)}
              className={`px-3 py-1 text-xs rounded-md border ${s.id === skidAtivoId ? "bg-os-azul-marinho text-white border-os-azul-marinho" : "border-slate-300 text-os-azul-marinho"}`}
            >
              {s.nome}
            </button>
          ))}
        </div>
      )}

      {!skids && <p className="p-4 text-os-cinza text-sm">Carregando...</p>}
      {skids && skids.length === 0 && <p className="p-4 text-os-cinza text-sm">Esta usina não tem SKIDs cadastrados.</p>}
      {skid && skid.dias.length === 0 && <p className="p-4 text-os-cinza text-sm">Sem lançamentos por inversor neste SKID no período.</p>}

      {skid && skid.dias.length > 0 && (
        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-xs text-center border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-os-azul-marinho">
                <th rowSpan={2} className="px-3 py-2 text-left font-semibold border-b border-slate-200 bg-slate-50">Data</th>
                {skid.inversores.map((inv) => (
                  <th key={inv.id} className="px-3 py-2 font-semibold border-b border-slate-200 border-l border-slate-200 bg-slate-50">
                    {inv.identificacao}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-100 text-os-cinza">
                {skid.inversores.map((inv) => (
                  <th key={inv.id} className="px-3 py-1.5 font-semibold border-b border-slate-200 border-l border-slate-200 bg-slate-100">
                    {modo === "reais" ? "(kWh)" : "(%)"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skid.dias.map((dia, i) => (
                <tr key={dia.data} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-3 py-2 text-left whitespace-nowrap">{formatarDataBr(dia.data)}</td>
                  {skid.inversores.map((inv) => {
                    const valor = dia.valores[inv.id];
                    if (valor === undefined) return <td key={inv.id} className="px-3 py-2 text-os-cinza border-l border-white">—</td>;
                    const razao = dia.maximoKwh > 0 ? valor / dia.maximoKwh : 1;
                    return (
                      <td key={inv.id} className={`px-3 py-2 font-semibold border-l border-white ${faixaDe(razao).classe}`} title={`${(razao * 100).toFixed(1)}% do máximo do dia`}>
                        {modo === "reais"
                          ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : `${(razao * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
