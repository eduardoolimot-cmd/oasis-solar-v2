import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { api } from "../../api/client";

const UNIDADES_PADRAO = ["un", "pç", "m", "kg", "L", "cx", "rolo", "par", "jogo"];

interface Props {
  usinaId: string;
  categorias: string[];
  unidades: string[];
  onCriado: () => void;
  onFechar: () => void;
}

/// Cadastro de novo material: todos os campos obrigatórios (nome, categoria, nº da etiqueta,
/// unidade, quantidade e foto); custo unitário opcional. A quantidade entra como ENTRADA na usina.
export function NovoMaterial({ usinaId, categorias, unidades, onCriado, onFechar }: Props) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoFoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!foto) return setPrevia(null);
    const url = URL.createObjectURL(foto);
    setPrevia(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const numero = (texto: string) => texto.trim().replace(",", ".");
  const quantidadeValida = quantidade.trim() !== "" && Number.isFinite(Number(numero(quantidade))) && Number(numero(quantidade)) >= 0;
  const custoValido = custo.trim() === "" || (Number.isFinite(Number(numero(custo))) && Number(numero(custo)) >= 0);
  const faltando = [
    !nome.trim() && "nome",
    !categoria.trim() && "categoria",
    !etiqueta.trim() && "número da etiqueta",
    !unidade.trim() && "unidade",
    !quantidadeValida && "quantidade",
    !foto && "foto",
  ].filter(Boolean) as string[];

  async function salvar() {
    if (faltando.length || !custoValido || !foto) return;
    setErro(null);
    setSalvando(true);
    const dados = new FormData();
    dados.append("nome", nome.trim());
    dados.append("categoria", categoria.trim());
    dados.append("numeroEtiqueta", etiqueta.trim());
    dados.append("unidadeMedida", unidade.trim());
    dados.append("quantidade", numero(quantidade));
    if (custo.trim()) dados.append("custoUnitario", numero(custo));
    dados.append("imagem", foto);
    try {
      await api.post(`/estoque/${usinaId}/itens`, dados);
      onCriado();
    } catch (err: unknown) {
      setErro((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível cadastrar o material.");
    } finally {
      setSalvando(false);
    }
  }

  const listaUnidades = [...new Set([...UNIDADES_PADRAO, ...unidades])];
  const campo = "w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm";
  const rotulo = "block text-xs text-os-azul-marinho mb-1";

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-os-azul-marinho font-semibold">Novo material</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-os-cinza hover:text-os-azul-marinho">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-5">
          <div>
            <span className={rotulo}>Foto *</span>
            <input
              ref={campoFoto}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => campoFoto.current?.click()}
              className="w-full aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-os-cinza text-xs hover:border-os-azul-claro overflow-hidden"
            >
              {previa ? (
                <img src={previa} alt="Prévia da foto" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera size={28} className="mb-1" />
                  Adicionar foto
                  <span className="text-[10px] mt-1">JPG, PNG ou WebP até 10 MB</span>
                </>
              )}
            </button>
            {foto && (
              <button type="button" onClick={() => campoFoto.current?.click()} className="text-os-azul-marinho underline text-xs mt-1">
                Trocar foto
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            <div className="sm:col-span-2">
              <label className={rotulo}>Nome *</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Categoria *</label>
              <input list="categorias-estoque" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Escolha ou digite" className={campo} />
              <datalist id="categorias-estoque">
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={rotulo}>Número da etiqueta *</label>
              <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Unidade *</label>
              <input list="unidades-estoque" value={unidade} onChange={(e) => setUnidade(e.target.value)} className={campo} />
              <datalist id="unidades-estoque">
                {listaUnidades.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={rotulo}>Quantidade *</label>
              <input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo}>Custo unitário (R$, opcional)</label>
              <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} className={campo} />
              {!custoValido && <p className="text-os-estado-vermelho text-xs mt-1">Valor inválido.</p>}
            </div>
          </div>
        </div>

        {erro && <p className="text-os-estado-vermelho text-sm mt-4">{erro}</p>}
        {faltando.length > 0 && <p className="text-os-cinza text-xs mt-4">Falta preencher: {faltando.join(", ")}.</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onFechar} className="border border-slate-300 rounded-md px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={faltando.length > 0 || !custoValido || salvando}
            className="bg-os-laranja text-white rounded-md px-4 py-2 text-sm disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Cadastrar material"}
          </button>
        </div>
      </div>
    </div>
  );
}
