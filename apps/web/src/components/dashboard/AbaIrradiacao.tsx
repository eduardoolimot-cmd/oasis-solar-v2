import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";
import { AderenciaGauge } from "./AderenciaGauge";
import { ControlesAba } from "./ControlesAba";
import { fmt, KpiCard } from "./KpiCard";

interface Dados {
  usina: { id: string; nome: string; planoIrradiacao: string | null };
  kpis: { irradiacaoRealizadaKwhM2: number | null; irradiacaoPrevistaKwhM2: number | null; aderenciaPct: number | null };
  graficoDiario: { data: string; irradiacaoKwhM2: number | null; irradiacaoPrevistaKwhM2: number | null }[];
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

export function AbaIrradiacao({ usinaId, inicio, fim, onAlterarIntervalo }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function carregar() {
    setErro(null);
    api
      .get(`/usinas/${usinaId}/irradiacao`, { params: { inicio, fim } })
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
        rotaReprocessar="/usinas/:usinaId/irradiacao/reprocessar"
        ultimoProcessamento={dados?.ultimoProcessamento ?? null}
        onReprocessado={carregar}
      />

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          <p className="text-os-cinza text-xs mb-3">
            Plano: {dados.usina.planoIrradiacao ?? "não definido"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
            <KpiCard
              titulo="Irradiação realizada"
              valor={fmt(dados.kpis.irradiacaoRealizadaKwhM2, 1)}
              unidade={dados.kpis.irradiacaoRealizadaKwhM2 !== null ? "kWh/m²" : undefined}
              info="Energia solar medida no plano dos módulos, somando os dias do período com irradiação lançada. Dias sem lançamento não entram na soma."
            />
            <KpiCard
              titulo="Irradiação prevista"
              valor={fmt(dados.kpis.irradiacaoPrevistaKwhM2, 1)}
              unidade={dados.kpis.irradiacaoPrevistaKwhM2 !== null ? "kWh/m²" : undefined}
              info="Irradiação mensal efetiva (GlobEff) prevista pelo PVsyst, somada nos meses inteiros do período. Sem dados quando não há previsão cadastrada para o período."
            />
            <AderenciaGauge
              titulo="Aderência à previsão"
              aderenciaPct={dados.kpis.aderenciaPct}
              corPrincipal="#45A3DB"
              info="Quanto da irradiação prevista foi de fato recebida. Aderência = irradiação realizada ÷ irradiação prevista × 100. Acima de 100% significa mais sol que o previsto."
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-os-azul-marinho font-medium text-sm mb-3">Irradiação Diária Realizada (kWh/m²)</h3>
            {dados.graficoDiario.every((d) => d.irradiacaoKwhM2 === null && d.irradiacaoPrevistaKwhM2 === null) ? (
              <p className="text-os-cinza text-sm">Sem dados no período.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dados.graficoDiario.map((d) => ({ ...d, dataBr: formatarDataBr(d.data) }))}>
                  <CartesianGrid stroke="#EEF2F6" vertical={false} />
                  <XAxis dataKey="dataBr" tick={{ fontSize: 11, fill: "#878787" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#878787" }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="irradiacaoKwhM2" name="Irradiação realizada (kWh/m²)" stroke="#45A3DB" strokeWidth={2} dot={false} connectNulls={false} />
                  <Line dataKey="irradiacaoPrevistaKwhM2" name="Irradiação prevista (kWh/m²/dia, meta ÷ dias do mês)" stroke="#FBBB21" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
