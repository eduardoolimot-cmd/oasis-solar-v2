import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { AderenciaGauge } from "./AderenciaGauge";
import { ControlesAba } from "./ControlesAba";
import { fmt, KpiCard } from "./KpiCard";

interface Dados {
  usina: { id: string; nome: string };
  metodo: string;
  kpis: { prRealizadoPct: number | null; prEsperadoPct: number | null; aderenciaPct: number | null; diasComDadosPareados: number };
  graficoDiario: { data: string; prPct: number | null; prPrevistoPct: number | null }[];
  skids: { id: string; nome: string }[];
  tabelaPorSkid: { skidId: string; nome: string; prAgregadoPct: number | null }[];
  ultimoProcessamento: { data: string; usuario: string | null } | null;
}

function formatarDataBr(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

function corFaixaPr(pr: number | null): string {
  if (pr === null) return "bg-slate-100 text-os-cinza";
  if (pr >= 85) return "bg-os-estado-verde/15 text-os-estado-verde";
  if (pr >= 70) return "bg-os-amarelo/20 text-os-azul-marinho";
  if (pr >= 50) return "bg-os-laranja/20 text-os-laranja";
  return "bg-os-estado-vermelho/15 text-os-estado-vermelho";
}

interface Props {
  usinaId: string;
  inicio: string;
  fim: string;
  onAlterarIntervalo: (inicio: string, fim: string) => void;
}

export function AbaPR({ usinaId, inicio, fim, onAlterarIntervalo }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    api
      .get(`/usinas/${usinaId}/pr`, { params: { inicio, fim } })
      .then(({ data }) => setDados(data))
      .catch((err) => setErro(err?.response?.data?.erro || "Não foi possível carregar."));
  }

  useEffect(carregar, [usinaId, inicio, fim]);

  return (
    <div>
      <ControlesAba
        inicio={inicio}
        fim={fim}
        onAlterarIntervalo={onAlterarIntervalo}
        usinaId={usinaId}
        rotaReprocessar="/usinas/:usinaId/pr/reprocessar"
        ultimoProcessamento={dados?.ultimoProcessamento ?? null}
        onReprocessado={carregar}
      />

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          <p className="text-os-cinza text-xs mb-3">Método: {dados.metodo} · {dados.kpis.diasComDadosPareados} dia(s) com geração e irradiação disponíveis no período.</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
            <KpiCard
              titulo="PR realizado"
              valor={dados.kpis.prRealizadoPct !== null ? fmt(dados.kpis.prRealizadoPct, 2) : "Sem dados"}
              unidade={dados.kpis.prRealizadoPct !== null ? "%" : undefined}
              info="Performance Ratio: quanto da energia teoricamente disponível virou geração. PR = geração ÷ (potência DC instalada × irradiação no plano). Só entram os dias com geração e irradiação lançadas, para não misturar períodos de cobertura diferente."
            />
            <KpiCard
              titulo="PR esperado"
              valor={dados.kpis.prEsperadoPct !== null ? fmt(dados.kpis.prEsperadoPct, 2) : "Não calculável"}
              unidade={dados.kpis.prEsperadoPct !== null ? "%" : undefined}
              info="PR previsto pelo PVsyst (Performance Ratio mensal) para o período: média dos PR mensais ponderada pela geração prevista de cada mês, nos meses inteiros. Não calculável sem previsão cadastrada."
            />
            <AderenciaGauge
              titulo="Aderência à meta de PR"
              aderenciaPct={dados.kpis.aderenciaPct}
              corPrincipal="#00386D"
              info="Quanto do PR esperado foi atingido. Aderência = PR realizado ÷ PR esperado × 100. Abaixo de 100% indica desempenho inferior ao previsto para a usina."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Performance Ratio Diário (%)</h3>
            {dados.graficoDiario.every((d) => d.prPct === null && d.prPrevistoPct === null) ? (
              <p className="text-os-cinza text-sm">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={dados.graficoDiario.map((d) => ({ ...d, dataBr: formatarDataBr(d.data) }))}>
                  <CartesianGrid stroke="#EEF2F6" vertical={false} />
                  <XAxis dataKey="dataBr" tick={{ fontSize: 11, fill: "#878787" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#878787" }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="prPct" name="PR realizado (%)" fill="#00386D" radius={[4, 4, 0, 0]} />
                  <Line dataKey="prPrevistoPct" name="PR previsto (%)" stroke="#FBBB21" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">PR agregado por SKID</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dados.tabelaPorSkid.map((s) => (
                <div key={s.skidId} className={`rounded-md p-3 text-center ${corFaixaPr(s.prAgregadoPct)}`}>
                  <p className="text-xs mb-1">{s.nome}</p>
                  <p className="text-lg font-semibold">{s.prAgregadoPct !== null ? `${fmt(s.prAgregadoPct, 1)}%` : "—"}</p>
                </div>
              ))}
              {dados.tabelaPorSkid.length === 0 && <p className="text-os-cinza text-sm col-span-full">Nenhum SKID cadastrado.</p>}
            </div>
            <p className="text-os-cinza text-xs mt-3">
              Faixas: verde ≥85% · amarelo 70–85% · laranja 50–70% · vermelho &lt;50% · cinza sem dado. Configuráveis por usina/metodologia.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
