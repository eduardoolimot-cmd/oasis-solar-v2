import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { FotoAutenticada } from "../FotoAutenticada";

interface SaldoItem {
  itemId: string;
  nome: string;
  categoria: string | null;
  unidadeMedida: string;
  estoqueMinimo: number | null;
  imagemUrl: string | null;
  saldoQuantidade: number;
  custoMedioUnitario: number | null;
  abaixoDoMinimo: boolean;
}

interface Movimentacao {
  id: string;
  tipo: "ENTRADA" | "SAIDA" | "AJUSTE";
  quantidade: number;
  custoUnitario: number | null;
  motivo: string | null;
  item: { id: string; nome: string; unidadeMedida: string };
  ordemServico: { id: string; titulo: string } | null;
  criadoEm: string;
}

function fmt(v: number | null, casas = 2): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

interface Props {
  usinaId: string;
}

export function AbaEstoque({ usinaId }: Props) {
  const [saldos, setSaldos] = useState<SaldoItem[] | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarNovoItem, setMostrarNovoItem] = useState(false);
  const [nomeItem, setNomeItem] = useState("");
  const [categoriaItem, setCategoriaItem] = useState("");
  const [unidadeItem, setUnidadeItem] = useState("un");

  const [mostrarMovimentacao, setMostrarMovimentacao] = useState<"ENTRADA" | "SAIDA" | "AJUSTE" | null>(null);
  const [itemSelecionado, setItemSelecionado] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [motivo, setMotivo] = useState("");

  const { temPermissao } = useAuth();
  const podeEditarItem = temPermissao("estoque", "editar");

  const [itemEditando, setItemEditando] = useState<SaldoItem | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editUnidade, setEditUnidade] = useState("");
  const [editMinimo, setEditMinimo] = useState("");

  function abrirEdicaoItem(s: SaldoItem) {
    setItemEditando(s);
    setEditNome(s.nome);
    setEditCategoria(s.categoria ?? "");
    setEditUnidade(s.unidadeMedida);
    setEditMinimo(s.estoqueMinimo !== null ? String(s.estoqueMinimo) : "");
  }

  async function salvarEdicaoItem() {
    if (!itemEditando || !editNome.trim()) return;
    try {
      await api.put(`/estoque/catalogo/${itemEditando.itemId}`, {
        nome: editNome.trim(),
        categoria: editCategoria.trim() || undefined,
        unidadeMedida: editUnidade.trim() || "un",
        estoqueMinimo: editMinimo === "" ? null : Number(editMinimo),
      });
      setItemEditando(null);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível salvar o item.");
    }
  }

  async function excluirItem(s: SaldoItem) {
    if (!confirm(`Excluir o item "${s.nome}" do catálogo?`)) return;
    try {
      await api.delete(`/estoque/catalogo/${s.itemId}`);
      carregar();
    } catch (err: unknown) {
      const mensagem = (err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível excluir o item.";
      if (mensagem.includes("desative") && confirm(`${mensagem}\n\nDesativar o item agora?`)) {
        await api.put(`/estoque/catalogo/${s.itemId}`, { ativo: false });
        carregar();
      } else if (!mensagem.includes("desative")) {
        alert(mensagem);
      }
    }
  }

  const [itemEnviandoImagem, setItemEnviandoImagem] = useState<string | null>(null);
  const inputImagemRef = useRef<HTMLInputElement>(null);
  const itemAlvoImagemRef = useRef<string | null>(null);

  function carregar() {
    setErro(null);
    api.get(`/estoque/${usinaId}`).then(({ data }) => setSaldos(data)).catch(() => setErro("Não foi possível carregar o estoque."));
    api.get(`/estoque/${usinaId}/movimentacoes`).then(({ data }) => setMovimentacoes(data));
  }

  useEffect(carregar, [usinaId]);

  async function criarItem() {
    if (!nomeItem.trim()) return;
    await api.post("/estoque/catalogo", { nome: nomeItem.trim(), categoria: categoriaItem || undefined, unidadeMedida: unidadeItem || "un" });
    setNomeItem("");
    setCategoriaItem("");
    setUnidadeItem("un");
    setMostrarNovoItem(false);
    carregar();
  }

  function abrirMovimentacao(tipo: "ENTRADA" | "SAIDA" | "AJUSTE", itemId?: string) {
    setMostrarMovimentacao(tipo);
    setItemSelecionado(itemId ?? "");
    setQuantidade("");
    setCustoUnitario("");
    setMotivo("");
  }

  async function confirmarMovimentacao() {
    if (!itemSelecionado || !mostrarMovimentacao) return;
    try {
      if (mostrarMovimentacao === "AJUSTE") {
        if (!motivo.trim()) return alert("Informe o motivo do ajuste.");
        await api.post(`/estoque/${usinaId}/ajustes`, { itemId: itemSelecionado, novoSaldo: Number(quantidade), motivo: motivo.trim() });
      } else {
        await api.post(`/estoque/${usinaId}/movimentacoes`, {
          itemId: itemSelecionado,
          tipo: mostrarMovimentacao,
          quantidade: Number(quantidade),
          custoUnitario: mostrarMovimentacao === "ENTRADA" ? Number(custoUnitario) : undefined,
        });
      }
      setMostrarMovimentacao(null);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível registrar.");
    }
  }

  function abrirSeletorImagem(itemId: string) {
    itemAlvoImagemRef.current = itemId;
    inputImagemRef.current?.click();
  }

  async function enviarImagemSelecionada(arquivo: File) {
    const itemId = itemAlvoImagemRef.current;
    if (!itemId) return;
    setItemEnviandoImagem(itemId);
    const dados = new FormData();
    dados.append("imagem", arquivo);
    try {
      await api.post(`/estoque/catalogo/${itemId}/imagem`, dados, { headers: { "Content-Type": "multipart/form-data" } });
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Falha ao enviar a imagem.");
    } finally {
      setItemEnviandoImagem(null);
    }
  }

  async function removerImagem(itemId: string) {
    await api.delete(`/estoque/catalogo/${itemId}/imagem`);
    carregar();
  }

  if (!saldos) return <p className="text-os-cinza text-sm">Carregando...</p>;

  return (
    <div>
      {erro && <p className="text-os-estado-vermelho text-sm mb-3">{erro}</p>}

      <div className="flex justify-end mb-3">
        <button onClick={() => setMostrarNovoItem((v) => !v)} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm">
          {mostrarNovoItem ? "Cancelar" : "+ Novo item no catálogo"}
        </button>
      </div>

      {mostrarNovoItem && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Nome</label>
            <input value={nomeItem} onChange={(e) => setNomeItem(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Categoria</label>
            <input value={categoriaItem} onChange={(e) => setCategoriaItem(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-os-azul-marinho mb-1">Unidade</label>
            <input value={unidadeItem} onChange={(e) => setUnidadeItem(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
          </div>
          <div className="sm:col-span-3">
            <button onClick={criarItem} className="bg-os-laranja text-white rounded-md px-4 py-2 text-sm">Adicionar ao catálogo</button>
          </div>
        </div>
      )}

      {itemEditando && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-os-azul-marinho font-semibold mb-3">Editar item do catálogo</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-os-azul-marinho mb-1">Nome</label>
                <input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-os-azul-marinho mb-1">Categoria</label>
                <input value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Unidade</label>
                  <input value={editUnidade} onChange={(e) => setEditUnidade(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Estoque mínimo</label>
                  <input type="number" value={editMinimo} onChange={(e) => setEditMinimo(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setItemEditando(null)} className="border border-slate-300 rounded-md px-4 py-2 text-sm">Cancelar</button>
              <button onClick={salvarEdicaoItem} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {mostrarMovimentacao && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-os-azul-marinho font-semibold mb-3">
              {mostrarMovimentacao === "ENTRADA" && "Registrar entrada"}
              {mostrarMovimentacao === "SAIDA" && "Registrar saída"}
              {mostrarMovimentacao === "AJUSTE" && "Ajuste de inventário"}
            </h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs text-os-azul-marinho mb-1">Item</label>
                <select value={itemSelecionado} onChange={(e) => setItemSelecionado(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                  <option value="">Selecione...</option>
                  {saldos.map((s) => (
                    <option key={s.itemId} value={s.itemId}>{s.nome} (saldo atual: {fmt(s.saldoQuantidade)} {s.unidadeMedida})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-os-azul-marinho mb-1">
                  {mostrarMovimentacao === "AJUSTE" ? "Novo saldo (contagem física)" : "Quantidade"}
                </label>
                <input type="number" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
              </div>
              {mostrarMovimentacao === "ENTRADA" && (
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Custo unitário</label>
                  <input type="number" value={custoUnitario} onChange={(e) => setCustoUnitario(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
              )}
              {mostrarMovimentacao === "AJUSTE" && (
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Motivo (obrigatório)</label>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setMostrarMovimentacao(null)} className="border border-slate-300 rounded-md px-4 py-2 text-sm">Cancelar</button>
              <button onClick={confirmarMovimentacao} className="bg-os-azul-marinho text-white rounded-md px-4 py-2 text-sm">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputImagemRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && enviarImagemSelecionada(e.target.files[0])}
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead className="bg-os-azul-marinho text-white">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Imagem</th>
              <th className="text-left px-4 py-2 font-medium">Item</th>
              <th className="text-left px-4 py-2 font-medium">Categoria</th>
              <th className="text-right px-4 py-2 font-medium">Saldo</th>
              <th className="text-right px-4 py-2 font-medium">Custo médio</th>
              <th className="text-right px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {saldos.map((s, i) => (
              <tr key={s.itemId} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FotoAutenticada caminho={s.imagemUrl} alt={s.nome} className="w-10 h-10 object-cover rounded border border-slate-200" />
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={itemEnviandoImagem === s.itemId}
                        onClick={() => abrirSeletorImagem(s.itemId)}
                        className="text-os-azul-marinho underline text-xs text-left disabled:opacity-60"
                      >
                        {itemEnviandoImagem === s.itemId ? "Enviando..." : s.imagemUrl ? "Substituir" : "Adicionar"}
                      </button>
                      {s.imagemUrl && (
                        <button type="button" onClick={() => removerImagem(s.itemId)} className="text-os-estado-vermelho underline text-xs text-left">
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">{s.nome}</td>
                <td className="px-4 py-2 text-os-cinza">{s.categoria ?? "—"}</td>
                <td className={`px-4 py-2 text-right ${s.abaixoDoMinimo ? "text-os-estado-vermelho font-medium" : ""}`}>
                  {fmt(s.saldoQuantidade)} {s.unidadeMedida}
                  {s.abaixoDoMinimo && " ⚠"}
                </td>
                <td className="px-4 py-2 text-right">{s.custoMedioUnitario !== null ? `R$ ${fmt(s.custoMedioUnitario)}` : "Sem custo apurado"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => abrirMovimentacao("ENTRADA", s.itemId)} className="text-os-estado-verde underline text-xs mr-2">Entrada</button>
                  <button onClick={() => abrirMovimentacao("SAIDA", s.itemId)} className="text-os-laranja underline text-xs mr-2">Saída</button>
                  <button onClick={() => abrirMovimentacao("AJUSTE", s.itemId)} className="text-os-cinza underline text-xs mr-2">Ajustar</button>
                  {podeEditarItem && (
                    <>
                      <button onClick={() => abrirEdicaoItem(s)} className="text-os-azul-marinho underline text-xs mr-2">Editar</button>
                      <button onClick={() => excluirItem(s)} className="text-os-estado-vermelho underline text-xs">Excluir</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {saldos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-os-cinza text-sm">Nenhum item no catálogo ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Últimas movimentações</h3>
        {movimentacoes.length === 0 ? (
          <p className="text-os-cinza text-sm">Nenhuma movimentação registrada.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-os-cinza border-b border-slate-200">
                <th className="py-1.5 pr-2">Data</th>
                <th className="py-1.5 pr-2">Item</th>
                <th className="py-1.5 pr-2">Tipo</th>
                <th className="py-1.5 pr-2 text-right">Quantidade</th>
                <th className="py-1.5 pr-2 text-right">Custo unitário</th>
                <th className="py-1.5 pr-2">OS vinculada</th>
                <th className="py-1.5">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{new Date(m.criadoEm).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 pr-2">{m.item.nome}</td>
                  <td className="py-1.5 pr-2">{m.tipo}</td>
                  <td className="py-1.5 pr-2 text-right">{fmt(m.quantidade)} {m.item.unidadeMedida}</td>
                  <td className="py-1.5 pr-2 text-right">{m.custoUnitario !== null ? `R$ ${fmt(m.custoUnitario)}` : "—"}</td>
                  <td className="py-1.5 pr-2">{m.ordemServico?.titulo ?? "—"}</td>
                  <td className="py-1.5 text-os-cinza">{m.motivo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
