import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { AderenciaGauge } from "./AderenciaGauge";
import { ControlesAba } from "./ControlesAba";
import { fmt, KpiCard } from "./KpiCard";
import { NotaDegradacao, type ResumoDegradacao } from "./NotaDegradacao";

interface Dados {
  usina: { id: string; nome: string; potenciaDcKwp: number; potenciaAcKw: number | null };
  baseUsada: "AC" | "DC";
  kpis: { fcAferidoPct: number | null; fcMetaPct: number | null; aderenciaPct: number | null; degradacao: ResumoDegradacao | null };
  graficoDiario: { data: string; fcPct: number }[];
  graficoPorSkid: { skidId: string; nome: string; fcPct: number | null }[];
  ultimoProcessamento: { data: string; usuario: string | null } | null;
}

function formatarDataBr(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

interface Props {
  usinaId: string;
  inicio: string;
  fim: string;
  onAlterarIntervalo: (inicio: string, fim: string) => void;
}

export function AbaFC({ usinaId, inicio, fim, onAlterarIntervalo }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    api
      .get(`/usinas/${usinaId}/fc`, { params: { inicio, fim } })
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
        rotaReprocessar="/usinas/:usinaId/fc/reprocessar"
        ultimoProcessamento={dados?.ultimoProcessamento ?? null}
        onReprocessado={carregar}
      />

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          <p className="text-os-cinza text-xs mb-3">
            Base de potência: {dados.baseUsada === "AC" ? "AC nominal" : "DC instalada (kWp)"}
            {dados.baseUsada === "DC" && !dados.usina.potenciaAcKw && " — potência CA não cadastrada."}
          </p>
          <NotaDegradacao degradacao={dados.kpis.degradacao} />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
            <KpiCard
              titulo="Fator de Capacidade aferido"
              valor={dados.kpis.fcAferidoPct !== null ? fmt(dados.kpis.fcAferidoPct, 2) : "Sem dados"}
              unidade={dados.kpis.fcAferidoPct !== null ? "%" : undefined}
              info="Quanto a usina gerou em relação ao máximo possível operando na potência de referência o tempo todo. FC = energia gerada ÷ (potência de referência × horas do período). A base de potência (AC ou DC) está indicada acima."
            />
            <KpiCard
              titulo="Meta de FC"
              valor={dados.kpis.fcMetaPct !== null ? fmt(dados.kpis.fcMetaPct, 2) : "Não calculável"}
              unidade={dados.kpis.fcMetaPct !== null ? "%" : undefined}
              info="FC esperado pela meta P50 (ajustada pela degradação esperada da usina): soma da geração P50 ÷ soma de (potência de referência × horas) dos meses inteiros do período. Não é média de percentuais. Não calculável sem meta P50 cadastrada."
            />
            <AderenciaGauge
              titulo="Aderência à meta de FC"
              aderenciaPct={dados.kpis.aderenciaPct}
              corPrincipal="#00386D"
              info="Quanto da meta de FC foi atingido. Aderência = FC aferido ÷ meta de FC × 100. Acima de 100% indica que a usina superou a meta."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Fator de Capacidade Diário (%)</h3>
            {dados.graficoDiario.length === 0 ? (
              <p className="text-os-cinza text-sm">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dados.graficoDiario.map((d) => ({ ...d, dataBr: formatarDataBr(d.data) }))}>
                  <CartesianGrid stroke="#EEF2F6" vertical={false} />
                  <XAxis dataKey="dataBr" tick={{ fontSize: 11, fill: "#878787" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#878787" }} unit="%" />
                  <Tooltip />
                  <Line dataKey="fcPct" name="FC (%)" stroke="#00386D" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">FC por SKID no período</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {dados.graficoPorSkid.map((s) => (
                <div key={s.skidId} className="rounded-md p-3 text-center bg-slate-50">
                  <p className="text-xs text-os-cinza mb-1">{s.nome}</p>
                  <p className="text-lg font-semibold text-os-azul-marinho">{s.fcPct !== null ? `${fmt(s.fcPct, 1)}%` : "—"}</p>
                </div>
              ))}
              {dados.graficoPorSkid.length === 0 && <p className="text-os-cinza text-sm col-span-full">Nenhum SKID cadastrado.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
