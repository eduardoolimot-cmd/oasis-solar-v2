import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useFiltros } from "../context/FiltrosContext";
import { formatarDataBr } from "../lib/formatarData";

interface Resumo {
  usina: { id: string; nome: string; potenciaDcKwp: number };
  periodo: { inicio: string; fim: string };
  kpis: { custoTotal: number; custoPorKwp: number | null; consumoSemCustoApurado: number };
  custoPorCategoria: Record<string, number>;
  serieMensal: { mes: string; valor: number }[];
}

interface Lancamento {
  id: string;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  ordemServico: { id: string; titulo: string } | null;
}

const CATEGORIAS = [
  { chave: "MAO_DE_OBRA", rotulo: "Mão de obra" },
  { chave: "SERVICO_TERCEIRIZADO", rotulo: "Serviço terceirizado" },
  { chave: "PECAS_AVULSAS", rotulo: "Peças avulsas" },
  { chave: "OUTROS", rotulo: "Outros" },
] as const;

const ROTULO_CATEGORIA: Record<string, string> = {
  PECAS_ESTOQUE: "Peças (consumo de estoque)",
  MAO_DE_OBRA: "Mão de obra",
  SERVICO_TERCEIRIZADO: "Serviço terceirizado",
  PECAS_AVULSAS: "Peças avulsas",
  OUTROS: "Outros",
};

function fmtMoeda(v: number | null): string {
  if (v === null) return "Não calculável";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return new Date(Number(ano), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

export function Financeiro() {
  const { usinaAtivaId, ano, modo, mes } = useFiltros();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["chave"]>("MAO_DE_OBRA");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");

  function carregar() {
    if (!usinaAtivaId) return;
    setErro(null);
    api
      .get(`/usinas/${usinaAtivaId}/financeiro/resumo`, { params: { ano, modo, mes } })
      .then(({ data }) => setResumo(data))
      .catch(() => setErro("Não foi possível carregar o resumo financeiro."));
    api.get(`/usinas/${usinaAtivaId}/financeiro/lancamentos`, { params: { ano, modo, mes } }).then(({ data }) => setLancamentos(data));
  }

  useEffect(carregar, [usinaAtivaId, ano, modo, mes]);

  async function criarLancamento() {
    if (!usinaAtivaId || !descricao.trim() || !valor || !data) return;
    try {
      await api.post(`/usinas/${usinaAtivaId}/financeiro/lancamentos`, {
        categoria,
        descricao: descricao.trim(),
        valor: Number(valor),
        data,
      });
      setDescricao("");
      setValor("");
      setData("");
      setMostrarForm(false);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível lançar o custo.");
    }
  }

  async function excluirLancamento(id: string) {
    if (!usinaAtivaId) return;
    if (!confirm("Excluir este lançamento?")) return;
    await api.delete(`/usinas/${usinaAtivaId}/financeiro/lancamentos/${id}`);
    carregar();
  }

  if (!usinaAtivaId) {
    return <p className="text-os-cinza text-sm">Selecione uma usina na barra superior para ver o financeiro.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Financeiro</h1>
      <p className="text-os-cinza text-sm mb-4">Custo de O&M — mesmo período do filtro da barra superior.</p>

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!resumo && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {resumo && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-os-cinza text-xs mb-1">Custo total de O&M</p>
              <p className="text-2xl font-semibold text-os-azul-marinho">{fmtMoeda(resumo.kpis.custoTotal)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-os-cinza text-xs mb-1">Custo por kWp instalado</p>
              <p className="text-2xl font-semibold text-os-azul-marinho">{fmtMoeda(resumo.kpis.custoPorKwp)}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-os-cinza text-xs mb-1">Consumo de estoque sem custo apurado</p>
              <p className={`text-2xl font-semibold ${resumo.kpis.consumoSemCustoApurado > 0 ? "text-os-amarelo" : "text-os-azul-marinho"}`}>
                {resumo.kpis.consumoSemCustoApurado}
              </p>
            </div>
          </div>

          {resumo.kpis.consumoSemCustoApurado > 0 && (
            <div className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-xs rounded-md px-4 py-2 mb-6 max-w-3xl">
              {resumo.kpis.consumoSemCustoApurado} saída(s) de estoque no período não entraram no custo total por não terem custo médio apurado ainda (item sem entrada registrada com custo).
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Custo por categoria</h3>
              <div className="flex flex-col gap-2">
                {Object.entries(resumo.custoPorCategoria).map(([cat, valor]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <span className="text-os-cinza">{ROTULO_CATEGORIA[cat] ?? cat}</span>
                    <span className="font-medium text-os-azul-marinho">{fmtMoeda(valor)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Tendência mensal</h3>
              {resumo.serieMensal.length === 0 ? (
                <p className="text-os-cinza text-sm">Sem lançamentos no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={resumo.serieMensal.map((s) => ({ ...s, mesBr: fmtMes(s.mes) }))}>
                    <CartesianGrid stroke="#EEF2F6" vertical={false} />
                    <XAxis dataKey="mesBr" tick={{ fontSize: 11, fill: "#878787" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#878787" }} />
                    <Tooltip formatter={(v) => fmtMoeda(Number(v))} />
                    <Bar dataKey="valor" name="Custo" fill="#EE7528" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-os-azul-marinho font-medium text-sm">Lançamentos manuais no período ({lancamentos.length})</h3>
              <button onClick={() => setMostrarForm((v) => !v)} className="text-os-azul-marinho text-xs underline">
                {mostrarForm ? "Cancelar" : "+ Novo lançamento"}
              </button>
            </div>

            {mostrarForm && (
              <div className="flex flex-wrap items-end gap-2 mb-4 bg-slate-50 rounded-md p-3">
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Categoria</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
                    {CATEGORIAS.map((c) => (
                      <option key={c.chave} value={c.chave}>{c.rotulo}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-os-azul-marinho mb-1">Descrição</label>
                  <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Valor (R$)</label>
                  <input type="number" value={valor} onChange={(e) => setValor(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs w-28" />
                </div>
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Data</label>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </div>
                <button onClick={criarLancamento} className="bg-os-azul-marinho text-white rounded-md px-3 py-1.5 text-xs h-[30px]">Salvar</button>
              </div>
            )}

            {lancamentos.length === 0 ? (
              <p className="text-os-cinza text-sm">Nenhum lançamento manual no período.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-os-cinza border-b border-slate-200">
                    <th className="py-1.5 pr-2">Data</th>
                    <th className="py-1.5 pr-2">Categoria</th>
                    <th className="py-1.5 pr-2">Descrição</th>
                    <th className="py-1.5 pr-2 text-right">Valor</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{formatarDataBr(l.data)}</td>
                      <td className="py-1.5 pr-2">{ROTULO_CATEGORIA[l.categoria] ?? l.categoria}</td>
                      <td className="py-1.5 pr-2">{l.descricao}</td>
                      <td className="py-1.5 pr-2 text-right font-medium">{fmtMoeda(l.valor)}</td>
                      <td className="py-1.5">
                        <button onClick={() => excluirLancamento(l.id)} className="text-os-estado-vermelho underline">Excluir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
