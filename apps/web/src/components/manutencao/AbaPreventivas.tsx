import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { formatarDataBr } from "../../lib/formatarData";

interface Skid {
  id: string;
  nome: string;
}

interface Plano {
  id: string;
  titulo: string;
  descricao: string | null;
  frequenciaDias: number;
  skid: { id: string; nome: string } | null;
  proximaGeracao: string;
  ativo: boolean;
}

interface Props {
  usinaId: string;
}

export function AbaPreventivas({ usinaId }: Props) {
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [skids, setSkids] = useState<Skid[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [frequenciaDias, setFrequenciaDias] = useState("90");
  const [skidId, setSkidId] = useState("");
  const [proximaGeracao, setProximaGeracao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function carregar() {
    api.get(`/usinas/${usinaId}/preventivas`).then(({ data }) => setPlanos(data));
    api.get(`/usinas/${usinaId}/skids`).then(({ data }) => setSkids(data.skids));
  }

  useEffect(carregar, [usinaId]);

  async function criar() {
    setErro(null);
    if (!titulo.trim() || !proximaGeracao) return;
    try {
      await api.post(`/usinas/${usinaId}/preventivas`, {
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        frequenciaDias: Number(frequenciaDias),
        skidId: skidId || null,
        proximaGeracao,
      });
      setTitulo("");
      setDescricao("");
      setSkidId("");
      setProximaGeracao("");
      setMostrarForm(false);
      carregar();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível criar o plano.");
    }
  }

  async function gerarOs(plano: Plano) {
    setMensagem(null);
    try {
      const { data } = await api.post(`/usinas/${usinaId}/preventivas/${plano.id}/gerar-os`);
      setMensagem(`OS "${data.os.titulo}" gerada. Próxima geração: ${formatarDataBr(data.proximaGeracao)}.`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível gerar a OS.");
    }
  }

  async function alternarAtivo(plano: Plano) {
    await api.put(`/usinas/${usinaId}/preventivas/${plano.id}`, { ativo: !plano.ativo });
    carregar();
  }

  if (!planos) return <p className="text-os-cinza text-sm">Carregando...</p>;

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setMostrarForm((v) => !v)} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm">
          {mostrarForm ? "Cancelar" : "+ Novo plano preventivo"}
        </button>
      </div>

      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}
      {mensagem && <p className="text-os-estado-verde text-sm mb-3">{mensagem}</p>}

      {mostrarForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs text-os-azul-marinho mb-1">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-os-azul-marinho mb-1">Descrição</label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" rows={2} />
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Frequência (dias)</label>
            <input type="number" value={frequenciaDias} onChange={(e) => setFrequenciaDias(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">SKID (opcional)</label>
            <select value={skidId} onChange={(e) => setSkidId(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm">
              <option value="">Usina inteira</option>
              {skids.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Próxima geração</label>
            <input type="date" value={proximaGeracao} onChange={(e) => setProximaGeracao(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <button onClick={criar} className="bg-os-laranja text-white rounded-md px-4 py-2 text-sm">Criar plano</button>
          </div>
        </div>
      )}

      {planos.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-os-cinza text-sm">Nenhum plano preventivo cadastrado.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-os-azul-marinho text-white">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Plano</th>
                <th className="text-left px-4 py-2 font-medium">Equipamento</th>
                <th className="text-right px-4 py-2 font-medium">Frequência</th>
                <th className="text-right px-4 py-2 font-medium">Próxima geração</th>
                <th className="text-left px-4 py-2 font-medium">Situação</th>
                <th className="text-right px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p, i) => (
                <tr key={p.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                  <td className="px-4 py-2">{p.titulo}</td>
                  <td className="px-4 py-2">{p.skid?.nome ?? "Usina inteira"}</td>
                  <td className="px-4 py-2 text-right">{p.frequenciaDias} dias</td>
                  <td className="px-4 py-2 text-right">{formatarDataBr(p.proximaGeracao)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.ativo ? "bg-os-estado-verde/15 text-os-estado-verde" : "bg-slate-100 text-os-cinza"}`}>
                      {p.ativo ? "Ativo" : "Desativado"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <button onClick={() => gerarOs(p)} disabled={!p.ativo} className="text-os-azul-marinho underline text-xs mr-3 disabled:text-os-cinza disabled:no-underline">
                      Gerar OS
                    </button>
                    <button onClick={() => alternarAtivo(p)} className="text-os-cinza underline text-xs">
                      {p.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
