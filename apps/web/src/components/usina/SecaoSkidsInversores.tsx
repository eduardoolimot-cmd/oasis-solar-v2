import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { SecaoExpansivel } from "../SecaoExpansivel";

interface InversorResumo {
  id: string;
  identificacao: string;
  kwCa: number | null;
}

interface Skid {
  id: string;
  nome: string;
  uc: string | null;
  potenciaFvKwp: number | null;
  transformadorKva: number | null;
  ativo: boolean;
  inversores: InversorResumo[];
}

interface Props {
  usinaId: string;
}

export function SecaoSkidsInversores({ usinaId }: Props) {
  const [skids, setSkids] = useState<Skid[]>([]);
  const [totalInversores, setTotalInversores] = useState(0);
  const [naoAtribuidos, setNaoAtribuidos] = useState<InversorResumo[]>([]);
  const [nomeNovoSkid, setNomeNovoSkid] = useState("");
  const [novoInversorId, setNovoInversorId] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarFormInversor, setMostrarFormInversor] = useState(false);
  const [identificacaoInversor, setIdentificacaoInversor] = useState("");

  function carregar() {
    api.get(`/usinas/${usinaId}/skids`).then(({ data }) => {
      setSkids(data.skids);
      setTotalInversores(data.totalInversores);
      setNaoAtribuidos(data.naoAtribuidos);
    });
  }

  useEffect(carregar, [usinaId]);

  const totalAtribuidos = totalInversores - naoAtribuidos.length;

  async function criarSkid() {
    setErro(null);
    if (!nomeNovoSkid.trim()) return;
    try {
      await api.post(`/usinas/${usinaId}/skids`, { nome: nomeNovoSkid.trim() });
      setNomeNovoSkid("");
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível criar o SKID.");
    }
  }

  async function salvarUcSkid(skid: Skid, uc: string) {
    const novo = uc.trim();
    if (novo === (skid.uc ?? "")) return;
    setErro(null);
    try {
      await api.put(`/usinas/${usinaId}/skids/${skid.id}`, { uc: novo });
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar a UC.");
    }
  }

  async function excluirOuDesativarSkid(skid: Skid) {
    if (!confirm(`Excluir/desativar o SKID "${skid.nome}"? Esta ação será registrada no histórico.`)) return;
    try {
      await api.delete(`/usinas/${usinaId}/skids/${skid.id}`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível excluir.");
    }
  }

  async function desvincularInversor(inversorId: string) {
    await api.post(`/usinas/${usinaId}/inversores/${inversorId}/vincular`, { skidId: null });
    carregar();
  }

  async function vincularInversor(skidId: string, inversorId: string) {
    if (!inversorId) return;
    await api.post(`/usinas/${usinaId}/inversores/${inversorId}/vincular`, { skidId });
    setNovoInversorId("");
    carregar();
  }

  async function criarInversorNaoAtribuido() {
    setErro(null);
    if (!identificacaoInversor.trim()) return;
    try {
      await api.post(`/usinas/${usinaId}/inversores`, { identificacao: identificacaoInversor.trim() });
      setIdentificacaoInversor("");
      setMostrarFormInversor(false);
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível criar o inversor.");
    }
  }

  return (
    <SecaoExpansivel
      titulo="SKIDs e Inversores"
      subtitulo={`${totalAtribuidos} de ${totalInversores} inversores atribuídos a SKIDs`}
    >
      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {skids.map((skid) => (
          <div key={skid.id} className={`border rounded-lg p-4 ${skid.ativo ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-70"}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-os-azul-marinho font-medium">{skid.nome}{!skid.ativo && " (desativado)"}</h3>
              <button onClick={() => excluirOuDesativarSkid(skid)} className="text-os-estado-vermelho text-xs underline">
                excluir
              </button>
            </div>
            <div className="mb-3">
              <label className="block text-xs text-os-azul-marinho mb-1">UC (Unidade Consumidora) deste SKID</label>
              <input
                key={`${skid.id}-${skid.uc ?? ""}`}
                defaultValue={skid.uc ?? ""}
                placeholder="ex.: 0.002.440.770.054-62"
                onBlur={(e) => salvarUcSkid(skid, e.target.value)}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {skid.inversores.length === 0 && <span className="text-os-cinza text-xs">Nenhum inversor vinculado.</span>}
              {skid.inversores.map((inv) => (
                <span key={inv.id} className="inline-flex items-center gap-1 bg-slate-100 text-os-azul-marinho text-xs rounded-full px-3 py-1">
                  {inv.identificacao}
                  <button onClick={() => desvincularInversor(inv.id)} className="text-os-cinza hover:text-os-estado-vermelho" title="Remover vínculo">
                    ×
                  </button>
                </span>
              ))}
            </div>
            {naoAtribuidos.length > 0 && (
              <select
                onChange={(e) => vincularInversor(skid.id, e.target.value)}
                value=""
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              >
                <option value="">+ vincular inversor não atribuído</option>
                {naoAtribuidos.map((inv) => (
                  <option key={inv.id} value={inv.id}>{inv.identificacao}</option>
                ))}
              </select>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2 mb-6">
        <div className="flex-1">
          <label className="block text-sm text-os-azul-marinho mb-1">Nome do novo SKID (ex.: SKID 01)</label>
          <input value={nomeNovoSkid} onChange={(e) => setNomeNovoSkid(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <button onClick={criarSkid} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm h-[38px]">
          Criar SKID
        </button>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h3 className="text-os-azul-marinho font-medium text-sm mb-2">Inversores não atribuídos ({naoAtribuidos.length})</h3>
        {naoAtribuidos.length === 0 && <p className="text-os-cinza text-xs mb-3">Todos os inversores estão atribuídos a um SKID.</p>}
        <div className="flex flex-wrap gap-2 mb-3">
          {naoAtribuidos.map((inv) => (
            <span key={inv.id} className="bg-slate-100 text-os-azul-marinho text-xs rounded-full px-3 py-1">{inv.identificacao}</span>
          ))}
        </div>

        {mostrarFormInversor ? (
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-sm text-os-azul-marinho mb-1">Identificação (ex.: INVERSOR03)</label>
              <input value={identificacaoInversor} onChange={(e) => setIdentificacaoInversor(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <button onClick={criarInversorNaoAtribuido} className="bg-os-laranja text-white rounded-md px-4 py-2 text-sm h-[38px]">Adicionar</button>
            <button onClick={() => setMostrarFormInversor(false)} className="border border-slate-300 rounded-md px-4 py-2 text-sm h-[38px]">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setMostrarFormInversor(true)} className="text-os-azul-marinho text-sm underline">
            + Adicionar inversor
          </button>
        )}
      </div>
    </SecaoExpansivel>
  );
}
