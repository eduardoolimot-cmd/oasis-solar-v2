import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { AderenciaGauge } from "./AderenciaGauge";
import { ControlesAba } from "./ControlesAba";
import { IconeClima, ROTULO_CATEGORIA_CLIMA } from "./IconeClima";
import { fmt, KpiCard } from "./KpiCard";
import { NotaDegradacao, type ResumoDegradacao } from "./NotaDegradacao";
import { TabelaProdutividade } from "./TabelaProdutividade";

interface Dados {
  usina: { id: string; nome: string; potenciaDcKwp: number };
  kpis: { energiaBrutaKwh: number | null; irradiacaoRealizadaKwhM2: number | null; geracaoPrevistaKwh: number | null; degradacao: ResumoDegradacao | null; p50Kwh: number | null; p90Kwh: number | null; aderenciaP50Pct: number | null; aderenciaP90Pct: number | null };
  graficoDiario: { data: string; energiaKwh: number | null; irradiacaoRealizadaKwhM2: number | null; geracaoPrevistaKwh: number | null }[];
  tabelaDiaria: { data: string; somaInversoresKwh: number; porSkid: Record<string, number> }[];
  skids: { id: string; nome: string }[];
  ultimoProcessamento: { data: string; usuario: string | null } | null;
}

interface DiaClima {
  data: string;
  categoria: "SOL" | "NUBLADO" | "NEBLINA" | "CHUVA" | "TEMPESTADE";
  rotulo: string;
  precipitacaoMm: number | null;
  temperaturaMaxC: number | null;
  temperaturaMinC: number | null;
}

interface RespostaClima {
  disponivel: boolean;
  aviso: string | null;
  dias: DiaClima[];
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

interface Props {
  usinaId: string;
  inicio: string;
  fim: string;
  onAlterarIntervalo: (inicio: string, fim: string) => void;
}

export function AbaGeracaoBruta({ usinaId, inicio, fim, onAlterarIntervalo }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [clima, setClima] = useState<RespostaClima | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    api
      .get(`/usinas/${usinaId}/geracao-bruta`, { params: { inicio, fim } })
      .then(({ data }) => setDados(data))
      .catch((err) => setErro(err?.response?.data?.erro || "Não foi possível carregar."));
    api.get(`/usinas/${usinaId}/clima`, { params: { inicio, fim } }).then(({ data }) => setClima(data));
  }

  useEffect(carregar, [usinaId, inicio, fim]);

  const climaPorDia = new Map((clima?.dias ?? []).map((d) => [d.data, d]));

  return (
    <div>
      <ControlesAba
        inicio={inicio}
        fim={fim}
        onAlterarIntervalo={onAlterarIntervalo}
        usinaId={usinaId}
        rotaReprocessar="/usinas/:usinaId/geracao-bruta/reprocessar"
        ultimoProcessamento={dados?.ultimoProcessamento ?? null}
        onReprocessado={carregar}
      />

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          <NotaDegradacao degradacao={dados.kpis.degradacao} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-xl">
            <AderenciaGauge
              titulo="Aderência à meta P50"
              aderenciaPct={dados.kpis.aderenciaP50Pct}
              corPrincipal="#00386D"
              detalheRealizado={`${fmt(dados.kpis.energiaBrutaKwh, 0)} kWh`}
              detalheMeta={dados.kpis.p50Kwh !== null ? `Meta: ${fmt(dados.kpis.p50Kwh, 0)} kWh` : undefined}
              info="Compara a geração realizada com a meta P50 do estudo (PVsyst): a geração que se espera igualar ou superar em 50% dos anos, o cenário mais provável. Aderência = geração realizada ÷ meta P50 × 100. Considera só meses inteiros do período; sem meta cadastrada aparece “Não calculável”. Acima de 100% o anel enche, mas o número continua visível."
            />
            <AderenciaGauge
              titulo="Aderência à meta P90"
              aderenciaPct={dados.kpis.aderenciaP90Pct}
              corPrincipal="#FBBB21"
              detalheRealizado={`${fmt(dados.kpis.energiaBrutaKwh, 0)} kWh`}
              detalheMeta={dados.kpis.p90Kwh !== null ? `Meta: ${fmt(dados.kpis.p90Kwh, 0)} kWh` : undefined}
              info="Compara a geração realizada com a meta P90 do estudo (PVsyst): a geração que se espera igualar ou superar em 90% dos anos, um cenário conservador (abaixo do P50). Aderência = geração realizada ÷ meta P90 × 100. Considera só meses inteiros do período; sem meta cadastrada aparece “Não calculável”."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Geração de Energia Bruta e irradiação</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <KpiCard
                titulo="Irradiação realizada"
                valor={fmt(dados.kpis.irradiacaoRealizadaKwhM2, 1)}
                unidade={dados.kpis.irradiacaoRealizadaKwhM2 !== null ? "kWh/m²" : undefined}
                info="Energia solar medida no plano dos módulos (POA), somando os dias do período com irradiação lançada. Dias sem lançamento não entram na soma."
              />
              <KpiCard
                titulo="Geração prevista (PVsyst)"
                valor={fmt(dados.kpis.geracaoPrevistaKwh, 0)}
                unidade={dados.kpis.geracaoPrevistaKwh !== null ? "kWh" : undefined}
                info="Geração esperada para o período segundo a simulação do PVsyst (E_Grid, ano 0: módulos novos), ajustada pela degradação esperada cadastrada na usina. É a previsão mensal dividida pelos dias do mês, somada nos dias do período. Sem dados quando algum mês do período não tem previsão cadastrada."
              />
              <KpiCard
                titulo="Geração realizada"
                valor={fmt(dados.kpis.energiaBrutaKwh, 0)}
                unidade={dados.kpis.energiaBrutaKwh !== null ? "kWh" : undefined}
                info="Energia efetivamente gerada no período: soma da geração diária lançada por inversor (Σ inversores), em kWh."
              />
            </div>

            {dados.graficoDiario.every((d) => d.energiaKwh === null && d.geracaoPrevistaKwh === null) ? (
              <p className="text-os-cinza text-sm">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dados.graficoDiario.map((d) => ({ ...d, dataBr: formatarDataBr(d.data) }))}>
                  <CartesianGrid stroke="#EEF2F6" vertical={false} />
                  <XAxis dataKey="dataBr" tick={{ fontSize: 11, fill: "#878787" }} />
                  <YAxis yAxisId="energia" tick={{ fontSize: 11, fill: "#878787" }} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 11 }} />
                  <YAxis yAxisId="irradiacao" orientation="right" tick={{ fontSize: 11, fill: "#878787" }} label={{ value: "kWh/m²", angle: 90, position: "insideRight", fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="energia" dataKey="energiaKwh" name="Energia gerada (kWh)" fill="#00386D" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="energia" dataKey="geracaoPrevistaKwh" name="Geração prevista PVsyst (kWh/dia)" stroke="#FBBB21" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
                  <Line yAxisId="irradiacao" dataKey="irradiacaoRealizadaKwhM2" name="Irradiação realizada (kWh/m²)" stroke="#45A3DB" strokeWidth={2} dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="text-os-azul-marinho font-medium text-sm">Energia Ativa Gerada (kWh/dia)</h3>
              {clima && !clima.disponivel && <span className="text-os-cinza text-[11px]">{clima.aviso}</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 bg-slate-50 text-left px-3 py-2">Data</th>
                    <th className="text-left px-3 py-2" title="Previsão do tempo (Open-Meteo)">Clima</th>
                    <th className="text-right px-3 py-2">Σ Inversores</th>
                    {dados.skids.map((s) => <th key={s.id} className="text-right px-3 py-2">{s.nome}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dados.tabelaDiaria.length === 0 && (
                    <tr><td colSpan={3 + dados.skids.length} className="px-3 py-3 text-os-cinza">Sem dados no período.</td></tr>
                  )}
                  {dados.tabelaDiaria.map((linha, i) => {
                    const diaClima = climaPorDia.get(linha.data);
                    const tituloClima = diaClima
                      ? `${diaClima.rotulo}${diaClima.temperaturaMinC !== null && diaClima.temperaturaMaxC !== null ? ` · ${Math.round(diaClima.temperaturaMinC)}°–${Math.round(diaClima.temperaturaMaxC)}°` : ""}${diaClima.precipitacaoMm ? ` · ${diaClima.precipitacaoMm.toFixed(1)} mm` : ""}`
                      : "";
                    return (
                    <tr key={linha.data} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                      <td className="sticky left-0 bg-white px-3 py-1.5">{formatarDataBr(linha.data)}</td>
                      <td className="px-3 py-1.5">
                        {diaClima ? (
                          <span className="flex items-center justify-start gap-1.5 whitespace-nowrap" title={tituloClima}>
                            <IconeClima categoria={diaClima.categoria} titulo={tituloClima} />
                            <span>{ROTULO_CATEGORIA_CLIMA[diaClima.categoria]}</span>
                          </span>
                        ) : (
                          <span className="text-os-cinza">—</span>
                        )}
                      </td>
                      <td className="text-right px-3 py-1.5 font-medium">{fmt(linha.somaInversoresKwh, 1)}</td>
                      {dados.skids.map((s) => (
                        <td key={s.id} className="text-right px-3 py-1.5">{linha.porSkid[s.nome] !== undefined ? fmt(linha.porSkid[s.nome], 1) : "—"}</td>
                      ))}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <TabelaProdutividade usinaId={usinaId} inicio={inicio} fim={fim} />
        </>
      )}
    </div>
  );
}
