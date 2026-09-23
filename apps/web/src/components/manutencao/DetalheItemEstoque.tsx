import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react";
import { api } from "../../api/client";
import { FotoAutenticada } from "../FotoAutenticada";

export interface ItemDetalhe {
  itemId: string;
  nome: string;
  categoria: string | null;
  numeroEtiqueta: string | null;
  unidadeMedida: string;
  imagemUrl: string | null;
  saldoQuantidade: number;
  custoMedioUnitario: number | null;
}

interface Movimentacao {
  id: string;
  tipo: "ENTRADA" | "SAIDA" | "AJUSTE";
  quantidade: number;
  custoUnitario: number | null;
  motivo: string | null;
  ordemServico: { id: string; titulo: string } | null;
  criadoEm: string;
}

const ROTULO_TIPO: Record<Movimentacao["tipo"], string> = { ENTRADA: "Entrada", SAIDA: "Saída", AJUSTE: "Ajuste de inventário" };

function fmt(v: number | null, casas = 2): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function fmtReais(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  usinaId: string;
  item: ItemDetalhe;
  onFechar: () => void;
  onMovimentar: (tipo: "ENTRADA" | "SAIDA") => void;
}

/// Ficha do item: foto, dados de cadastro, saldo e o histórico de entradas e saídas nesta usina.
export function DetalheItemEstoque({ usinaId, item, onFechar, onMovimentar }: Props) {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[] | null>(null);

  useEffect(() => {
    api
      .get<Movimentacao[]>(`/estoque/${usinaId}/movimentacoes`, { params: { itemId: item.itemId } })
      .then(({ data }) => setMovimentacoes(data))
      .catch(() => setMovimentacoes([]));
  }, [usinaId, item.itemId]);

  const total = (tipo: Movimentacao["tipo"]) => (movimentacoes ?? []).filter((m) => m.tipo === tipo).reduce((s, m) => s + m.quantidade, 0);
  const un = item.unidadeMedida;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4" onClick={onFechar}>
      <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-os-azul-marinho font-semibold text-lg">{item.nome}</h2>
            <p className="text-os-cinza text-sm">{item.categoria ?? "Sem categoria"}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="text-os-cinza hover:text-os-azul-marinho">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-5 mb-5">
          <FotoAutenticada caminho={item.imagemUrl} alt={item.nome} className="w-full aspect-square object-cover rounded-lg border border-slate-200" />
          <div>
            <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <dt className="text-os-cinza text-xs">Número da etiqueta</dt>
                <dd className="font-medium text-os-azul-marinho">{item.numeroEtiqueta ?? "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-os-cinza text-xs">Unidade</dt>
                <dd className="font-medium text-os-azul-marinho">{un}</dd>
              </div>
              <div>
                <dt className="text-os-cinza text-xs">Saldo atual</dt>
                <dd className="font-semibold text-os-azul-marinho text-lg">
                  {fmt(item.saldoQuantidade)} {un}
                </dd>
              </div>
              <div>
                <dt className="text-os-cinza text-xs">Custo médio</dt>
                <dd className="font-medium text-os-azul-marinho">{item.custoMedioUnitario !== null ? fmtReais(item.custoMedioUnitario) : "Sem custo apurado"}</dd>
              </div>
            </dl>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-md border border-os-estado-verde/30 bg-os-estado-verde/5 px-3 py-2">
                <p className="text-xs text-os-cinza flex items-center gap-1">
                  <ArrowDownToLine size={14} className="text-os-estado-verde" /> Total de entradas
                </p>
                <p className="font-semibold text-os-azul-marinho">{movimentacoes ? `${fmt(total("ENTRADA"))} ${un}` : "…"}</p>
              </div>
              <div className="rounded-md border border-os-laranja/30 bg-os-laranja/5 px-3 py-2">
                <p className="text-xs text-os-cinza flex items-center gap-1">
                  <ArrowUpFromLine size={14} className="text-os-laranja" /> Total de saídas
                </p>
                <p className="font-semibold text-os-azul-marinho">{movimentacoes ? `${fmt(total("SAIDA"))} ${un}` : "…"}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onMovimentar("ENTRADA")} className="bg-os-estado-verde text-white rounded-md px-3 py-1.5 text-sm">
                Registrar entrada
              </button>
              <button onClick={() => onMovimentar("SAIDA")} className="bg-os-laranja text-white rounded-md px-3 py-1.5 text-sm">
                Registrar saída
              </button>
            </div>
          </div>
        </div>

        <h3 className="text-os-azul-marinho font-medium text-sm mb-2">Entradas e saídas</h3>
        {movimentacoes === null ? (
          <p className="text-os-cinza text-sm">Carregando...</p>
        ) : movimentacoes.length === 0 ? (
          <p className="text-os-cinza text-sm">Nenhuma movimentação deste item nesta usina.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-os-cinza border-b border-slate-200">
                <th className="py-1.5 pr-2 font-normal">Data</th>
                <th className="py-1.5 pr-2 font-normal">Tipo</th>
                <th className="py-1.5 pr-2 font-normal text-right">Quantidade</th>
                <th className="py-1.5 pr-2 font-normal text-right">Custo unitário</th>
                <th className="py-1.5 pr-2 font-normal">OS vinculada</th>
                <th className="py-1.5 font-normal">Observação</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2">{new Date(m.criadoEm).toLocaleString("pt-BR")}</td>
                  <td
                    className={`py-1.5 pr-2 font-medium ${m.tipo === "ENTRADA" ? "text-os-estado-verde" : m.tipo === "SAIDA" ? "text-os-laranja" : "text-os-cinza"}`}
                  >
                    {ROTULO_TIPO[m.tipo]}
                  </td>
                  <td className="py-1.5 pr-2 text-right">
                    {m.tipo === "AJUSTE" ? `saldo → ${fmt(m.quantidade)}` : `${m.tipo === "SAIDA" ? "−" : "+"}${fmt(m.quantidade)}`} {un}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{m.custoUnitario !== null ? fmtReais(m.custoUnitario) : "—"}</td>
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
