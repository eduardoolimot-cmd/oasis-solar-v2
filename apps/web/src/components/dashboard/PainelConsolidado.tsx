import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { useFiltros } from "../../context/FiltrosContext";
import { AderenciaGauge } from "./AderenciaGauge";
import { fmt, KpiCard } from "./KpiCard";

interface UsinaLinha {
  id: string;
  nome: string;
  potenciaDcKwp: number;
  realizadoKwh: number | null;
  previstaKwh: number | null;
  aderenciaPrevistaPct: number | null;
  prPct: number | null;
  rendimentoKwhKwp: number | null;
}

interface Dados {
  totalUsinas: number;
  potenciaTotalKwp: number | null;
  kpis: {
    realizadoKwh: number | null;
    previstaKwh: number | null;
    aderenciaPrevistaPct: number | null;
    p50Kwh: number | null;
    p90Kwh: number | null;
    aderenciaP50Pct: number | null;
    aderenciaP90Pct: number | null;
    realizadoComparavelP50Kwh: number | null;
    realizadoComparavelP90Kwh: number | null;
    prPct: number | null;
    rendimentoKwhKwp: number | null;
  };
  usinasSemRealizado: string[];
  usinasSemPrevista: string[];
  graficoDiario: { data: string; energiaKwh: number | null; geracaoPrevistaKwh: number | null }[];
  usinas: UsinaLinha[];
}

function formatarDataBr(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function pct(v: number | null) {
  return v === null ? "—" : `${fmt(v, 1)}%`;
}

/// Painel Principal com "Todas as usinas" selecionado no filtro: a carteira somada. Cada usina é
/// calculada como na sua própria aba de Geração Bruta e a carteira soma numeradores e denominadores
/// (rota /painel/consolidado) — nunca a média dos percentuais das usinas.
export function PainelConsolidado() {
  const { setUsinaAtivaId, setVisaoConsolidada } = useFiltros();
  const hoje = new Date();
  const [inicio, setInicio] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setErro(null);
    api
      .get<Dados>("/painel/consolidado", { params: { inicio, fim } })
      .then(({ data }) => setDados(data))
      .catch((err) => setErro(err?.response?.data?.erro || "Não foi possível carregar."));
  }, [inicio, fim]);

  function abrirUsina(id: string) {
    setVisaoConsolidada(false);
    setUsinaAtivaId(id);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-os-azul-marinho">Todas as usinas</h1>
        <p className="text-os-cinza text-sm mt-1">
          {dados ? `${dados.totalUsinas} usinas · ${dados.potenciaTotalKwp !== null ? (dados.potenciaTotalKwp / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : "—"} MWp no total` : "Carregando..."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4 bg-white border border-slate-200 rounded-lg p-4">
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">Início</label>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-os-azul-marinho mb-1">Fim</label>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
        </div>
        <p className="text-os-cinza text-xs ml-auto max-w-md">
          Soma de todas as usinas às quais você tem acesso. Cada usina tem a previsão ajustada pela sua própria curva de degradação.
        </p>
      </div>

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          {(dados.usinasSemRealizado.length > 0 || dados.usinasSemPrevista.length > 0) && (
            <div className="text-os-cinza text-xs mb-3 space-y-0.5">
              {dados.usinasSemRealizado.length > 0 && <p>Sem geração lançada no período (fora das aderências e do PR): {dados.usinasSemRealizado.join(", ")}.</p>}
              {dados.usinasSemPrevista.length > 0 && <p>Sem previsão cadastrada para todo o período (fora da geração prevista): {dados.usinasSemPrevista.join(", ")}.</p>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-xl">
            <AderenciaGauge
              titulo="Aderência à meta P50"
              aderenciaPct={dados.kpis.aderenciaP50Pct}
              corPrincipal="#00386D"
              detalheRealizado={`${fmt(dados.kpis.realizadoComparavelP50Kwh, 0)} kWh`}
              detalheMeta={dados.kpis.p50Kwh !== null ? `Meta: ${fmt(dados.kpis.p50Kwh, 0)} kWh` : undefined}
              info="Geração realizada da carteira ÷ soma das metas P50 das usinas × 100. Só entram as usinas com geração e meta no período, e só meses inteiros (mesma regra da aba de cada usina). É a soma dos kWh — nunca a média das aderências de cada usina."
            />
            <AderenciaGauge
              titulo="Aderência à meta P90"
              aderenciaPct={dados.kpis.aderenciaP90Pct}
              corPrincipal="#FBBB21"
              detalheRealizado={`${fmt(dados.kpis.realizadoComparavelP90Kwh, 0)} kWh`}
              detalheMeta={dados.kpis.p90Kwh !== null ? `Meta: ${fmt(dados.kpis.p90Kwh, 0)} kWh` : undefined}
              info="Geração realizada da carteira ÷ soma das metas P90 das usinas × 100 (cenário conservador). Só usinas com geração e meta no período, e só meses inteiros."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Geração consolidada</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <KpiCard
                titulo="Geração realizada"
                valor={fmt(dados.kpis.realizadoKwh, 0)}
                unidade={dados.kpis.realizadoKwh !== null ? "kWh" : undefined}
                info="Soma da geração lançada (Σ inversores) de todas as usinas no período."
              />
              <KpiCard
                titulo="Geração prevista (PVsyst)"
                valor={fmt(dados.kpis.previstaKwh, 0)}
                unidade={dados.kpis.previstaKwh !== null ? "kWh" : undefined}
                info="Soma da geração prevista pelo PVsyst de cada usina no período, cada uma ajustada pela sua curva de degradação. Usinas sem previsão para todo o período ficam de fora (listadas acima)."
              />
              <KpiCard
                titulo="Aderência à previsão"
                valor={dados.kpis.aderenciaPrevistaPct !== null ? fmt(dados.kpis.aderenciaPrevistaPct, 1) : "Não calculável"}
                unidade={dados.kpis.aderenciaPrevistaPct !== null ? "%" : undefined}
                info="Geração realizada ÷ geração prevista × 100, somando só as usinas que têm as duas no período."
              />
              <KpiCard
                titulo="PR da carteira"
                valor={dados.kpis.prPct !== null ? fmt(dados.kpis.prPct, 2) : "Sem dados"}
                unidade={dados.kpis.prPct !== null ? "%" : undefined}
                info="Performance Ratio da carteira: soma da geração ÷ soma da energia teórica (potência × irradiação) de cada usina, só nos dias com geração e irradiação lançadas. Não é a média dos PR das usinas."
              />
            </div>

            {dados.graficoDiario.every((d) => d.energiaKwh === null && d.geracaoPrevistaKwh === null) ? (
              <p className="text-os-cinza text-sm">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dados.graficoDiario.map((d) => ({ ...d, dataBr: formatarDataBr(d.data) }))}>
                  <CartesianGrid stroke="#EEF2F6" vertical={false} />
                  <XAxis dataKey="dataBr" tick={{ fontSize: 11, fill: "#878787" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#878787" }} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${fmt(Number(v), 0)} kWh`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="energiaKwh" name="Geração realizada — todas as usinas (kWh)" fill="#00386D" radius={[4, 4, 0, 0]} />
                  <Line dataKey="geracaoPrevistaKwh" name="Geração prevista PVsyst — todas as usinas (kWh/dia)" stroke="#FBBB21" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-6">
            <div className="px-4 pt-3">
              <h3 className="text-os-azul-marinho font-medium text-sm">Por usina</h3>
              <p className="text-os-cinza text-xs mt-0.5">Clique no nome da usina para abrir o painel dela.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2">Usina</th>
                    <th className="text-right px-3 py-2">Potência (kWp)</th>
                    <th className="text-right px-3 py-2">Geração realizada (kWh)</th>
                    <th className="text-right px-3 py-2">Geração prevista (kWh)</th>
                    <th className="text-right px-3 py-2">Aderência</th>
                    <th className="text-right px-3 py-2">PR</th>
                    <th className="text-right px-3 py-2">Rendimento (kWh/kWp)</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.usinas.map((u, i) => (
                    <tr key={u.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                      <td className="px-3 py-1.5">
                        <button onClick={() => abrirUsina(u.id)} className="text-os-azul-marinho underline text-left">{u.nome}</button>
                      </td>
                      <td className="text-right px-3 py-1.5">{fmt(u.potenciaDcKwp, 1)}</td>
                      <td className="text-right px-3 py-1.5">{u.realizadoKwh !== null ? fmt(u.realizadoKwh, 0) : "—"}</td>
                      <td className="text-right px-3 py-1.5">{u.previstaKwh !== null ? fmt(u.previstaKwh, 0) : "—"}</td>
                      <td className="text-right px-3 py-1.5">{pct(u.aderenciaPrevistaPct)}</td>
                      <td className="text-right px-3 py-1.5">{pct(u.prPct)}</td>
                      <td className="text-right px-3 py-1.5">{u.rendimentoKwhKwp !== null ? fmt(u.rendimentoKwhKwp, 1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold text-os-azul-marinho">
                    <td className="px-3 py-2">Total da carteira</td>
                    <td className="text-right px-3 py-2">{fmt(dados.potenciaTotalKwp, 1)}</td>
                    <td className="text-right px-3 py-2">{dados.kpis.realizadoKwh !== null ? fmt(dados.kpis.realizadoKwh, 0) : "—"}</td>
                    <td className="text-right px-3 py-2">{dados.kpis.previstaKwh !== null ? fmt(dados.kpis.previstaKwh, 0) : "—"}</td>
                    <td className="text-right px-3 py-2">{pct(dados.kpis.aderenciaPrevistaPct)}</td>
                    <td className="text-right px-3 py-2">{pct(dados.kpis.prPct)}</td>
                    <td className="text-right px-3 py-2">{dados.kpis.rendimentoKwhKwp !== null ? fmt(dados.kpis.rendimentoKwhKwp, 1) : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
