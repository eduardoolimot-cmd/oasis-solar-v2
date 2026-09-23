import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { FotoAutenticada } from "../FotoAutenticada";
import { formatarDataBr } from "../../lib/formatarData";

interface Skid {
  id: string;
  nome: string;
}

interface OS {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: "CORRETIVA" | "PREVENTIVA";
  status: "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";
  prioridade: "BAIXA" | "MEDIA" | "ALTA";
  skid: { id: string; nome: string } | null;
  dataPrevista: string | null;
  dataConclusao: string | null;
  criadoEm: string;
  fotos: { id: string; url: string; criadoEm: string }[];
}

const COLUNAS = [
  { status: "ABERTA", rotulo: "Aberta" },
  { status: "EM_ANDAMENTO", rotulo: "Em andamento" },
  { status: "CONCLUIDA", rotulo: "Concluída" },
  { status: "CANCELADA", rotulo: "Cancelada" },
] as const;

function corPrioridade(p: OS["prioridade"]): string {
  if (p === "ALTA") return "border-l-4 border-os-estado-vermelho";
  if (p === "MEDIA") return "border-l-4 border-os-amarelo";
  return "border-l-4 border-os-cinza";
}

interface Props {
  usinaId: string;
}

export function AbaKanban({ usinaId }: Props) {
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [skids, setSkids] = useState<Skid[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<"CORRETIVA" | "PREVENTIVA">("CORRETIVA");
  const [prioridade, setPrioridade] = useState<"BAIXA" | "MEDIA" | "ALTA">("MEDIA");
  const [skidId, setSkidId] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const inputFotosRef = useRef<HTMLInputElement>(null);

  const { temPermissao } = useAuth();
  const podeEditar = temPermissao("manutencao", "editar");
  const podeExcluir = temPermissao("manutencao", "cancelar");

  function carregar() {
    api.get(`/usinas/${usinaId}/ordens-servico`).then(({ data }) => setOrdens(data));
    api.get(`/usinas/${usinaId}/skids`).then(({ data }) => setSkids(data.skids));
  }

  useEffect(carregar, [usinaId]);

  function limparForm() {
    setTitulo("");
    setDescricao("");
    setTipo("CORRETIVA");
    setPrioridade("MEDIA");
    setSkidId("");
    setDataPrevista("");
    setEditandoId(null);
    setMostrarForm(false);
  }

  function iniciarEdicao(os: OS) {
    setEditandoId(os.id);
    setTitulo(os.titulo);
    setDescricao(os.descricao ?? "");
    setTipo(os.tipo);
    setPrioridade(os.prioridade);
    setSkidId(os.skid?.id ?? "");
    setDataPrevista(os.dataPrevista ? os.dataPrevista.slice(0, 10) : "");
    setMostrarForm(true);
  }

  async function salvar() {
    if (!titulo.trim()) return;
    const corpo = {
      titulo: titulo.trim(),
      descricao: descricao || undefined,
      tipo,
      prioridade,
      skidId: skidId || null,
      dataPrevista: dataPrevista || null,
    };
    try {
      if (editandoId) await api.put(`/usinas/${usinaId}/ordens-servico/${editandoId}`, corpo);
      else await api.post(`/usinas/${usinaId}/ordens-servico`, corpo);
      limparForm();
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar a OS.");
    }
  }

  async function excluir(os: OS) {
    if (!confirm(`Excluir a OS "${os.titulo}"? Esta ação não pode ser desfeita (fica registrada no histórico).`)) return;
    try {
      await api.delete(`/usinas/${usinaId}/ordens-servico/${os.id}`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível excluir a OS.");
    }
  }

  async function moverStatus(os: OS, novoStatus: OS["status"]) {
    await api.post(`/usinas/${usinaId}/ordens-servico/${os.id}/status`, { status: novoStatus });
    carregar();
  }

  async function enviarFotos(osId: string, arquivos: FileList) {
    const dados = new FormData();
    Array.from(arquivos).forEach((arquivo) => dados.append("fotos", arquivo));
    setEnviandoFotos(true);
    try {
      const { data } = await api.post(`/usinas/${usinaId}/ordens-servico/${osId}/fotos`, dados, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.rejeitados?.length) alert(data.rejeitados.join("\n"));
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível enviar as fotos.");
    } finally {
      setEnviandoFotos(false);
      if (inputFotosRef.current) inputFotosRef.current.value = "";
    }
  }

  async function excluirFoto(osId: string, fotoId: string) {
    if (!confirm("Excluir esta foto? A exclusão fica registrada no histórico.")) return;
    try {
      await api.delete(`/usinas/${usinaId}/ordens-servico/${osId}/fotos/${fotoId}`);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível excluir a foto.");
    }
  }

  if (!ordens) return <p className="text-os-cinza text-sm">Carregando...</p>;

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => {
            if (mostrarForm) limparForm();
            else setMostrarForm(true);
          }}
          className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm"
        >
          {mostrarForm ? "Cancelar" : "+ Nova Ordem de Serviço"}
        </button>
      </div>

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
            <label className="block text-xs text-os-azul-marinho mb-1">Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm">
              <option value="CORRETIVA">Corretiva</option>
              <option value="PREVENTIVA">Preventiva</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Prioridade</label>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value as typeof prioridade)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
            </select>
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
            <label className="block text-xs text-os-azul-marinho mb-1">Data prevista (opcional)</label>
            <input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-os-azul-marinho mb-1">Fotos</label>
            {editandoId ? (
              <div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(ordens?.find((o) => o.id === editandoId)?.fotos ?? []).map((foto) => (
                    <div key={foto.id} className="relative w-20 h-20">
                      <FotoAutenticada caminho={foto.url} alt="Foto da OS" className="w-20 h-20 object-cover rounded border border-slate-200" />
                      {podeEditar && (
                        <button
                          type="button"
                          onClick={() => excluirFoto(editandoId, foto.id)}
                          className="absolute -top-1.5 -right-1.5 bg-os-estado-vermelho text-white rounded-full p-0.5"
                          aria-label="Excluir foto"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {podeEditar && (
                  <>
                    <input
                      ref={inputFotosRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files?.length && enviarFotos(editandoId, e.target.files)}
                    />
                    <button
                      type="button"
                      disabled={enviandoFotos}
                      onClick={() => inputFotosRef.current?.click()}
                      className="border border-slate-300 text-os-azul-marinho rounded-md px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      {enviandoFotos ? "Enviando..." : "+ Adicionar fotos"}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-os-cinza text-xs">Salve a OS para anexar fotos.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <button onClick={salvar} className="bg-os-laranja text-white rounded-md px-4 py-2 text-sm">{editandoId ? "Salvar alterações" : "Criar"}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUNAS.map((coluna) => (
          <div key={coluna.status} className="bg-slate-100 rounded-lg p-3">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">
              {coluna.rotulo} ({ordens.filter((o) => o.status === coluna.status).length})
            </h3>
            <div className="flex flex-col gap-2">
              {ordens.filter((o) => o.status === coluna.status).map((os) => (
                <div key={os.id} className={`bg-white rounded-md p-3 shadow-sm ${corPrioridade(os.prioridade)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-os-azul-marinho">{os.titulo}</p>
                    {os.fotos.length > 0 && (
                      <span className="flex items-center gap-0.5 text-os-cinza text-[11px] shrink-0" title={`${os.fotos.length} foto(s) anexada(s)`}>
                        <Camera size={13} /> {os.fotos.length}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-os-cinza mt-0.5">
                    {os.tipo === "CORRETIVA" ? "Corretiva" : "Preventiva"} · {os.skid?.nome ?? "Usina inteira"}
                  </p>
                  {os.dataPrevista && <p className="text-xs text-os-cinza">Prevista: {formatarDataBr(os.dataPrevista)}</p>}
                  {(podeEditar || podeExcluir) && (
                    <div className="flex gap-3 mt-1 text-xs">
                      {podeEditar && <button onClick={() => iniciarEdicao(os)} className="text-os-azul-marinho underline">editar</button>}
                      {podeExcluir && <button onClick={() => excluir(os)} className="text-os-estado-vermelho underline">excluir</button>}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {COLUNAS.filter((c) => c.status !== os.status).map((c) => (
                      <button
                        key={c.status}
                        onClick={() => moverStatus(os, c.status)}
                        className="text-[10px] border border-slate-300 rounded-full px-2 py-0.5 text-os-cinza hover:text-os-azul-marinho hover:border-os-azul-marinho"
                      >
                        → {c.rotulo}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {ordens.filter((o) => o.status === coluna.status).length === 0 && (
                <p className="text-os-cinza text-xs italic">Nenhuma OS.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
