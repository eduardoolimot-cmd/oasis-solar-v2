import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useFiltros } from "../context/FiltrosContext";

// Ranking de Ativos — reaproveita o mesmo GET /painel/resumo do Painel Principal e do Comparativo
// (mesmos indicadores já calculados ali). Usinas sem o indicador escolhido calculável no período
// ficam fora da numeração (seção "Sem dados"), nunca tratadas como pior colocação — "dado ausente
// ≠ zero" também vale para ranqueamento.

interface IndicadoresUsina {
  usina: { id: string; nome: string; municipio: string | null; uf: string | null; situacao: string };
  geracao: { realizadaKwh: number | null };
  pr: number | null;
  ipe: number | null;
  rendimentoEspecificoKwhKwp: number | null;
}

const CRITERIOS = [
  { chave: "pr", rotulo: "Performance Ratio (PR)", unidade: "%", extrair: (u: IndicadoresUsina) => u.pr },
  { chave: "ipe", rotulo: "Aderência à previsão (IPE)", unidade: "%", extrair: (u: IndicadoresUsina) => u.ipe },
  { chave: "re", rotulo: "Rendimento específico (RE)", unidade: "kWh/kWp", extrair: (u: IndicadoresUsina) => u.rendimentoEspecificoKwhKwp },
  { chave: "geracao", rotulo: "Geração realizada", unidade: "kWh", extrair: (u: IndicadoresUsina) => u.geracao.realizadaKwh },
] as const;

type ChaveCriterio = (typeof CRITERIOS)[number]["chave"];

function fmt(v: number | null, casas = 1): string {
  if (v === null) return "Sem dados";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function corPosicao(posicao: number): string {
  if (posicao === 1) return "bg-os-amarelo text-os-azul-marinho";
  if (posicao === 2) return "bg-os-cinza/40 text-os-azul-marinho";
  if (posicao === 3) return "bg-os-laranja/60 text-white";
  return "bg-slate-100 text-os-cinza";
}

export function RankingAtivos() {
  const { ano, modo, mes, setUsinaAtivaId } = useFiltros();
  const navigate = useNavigate();
  const [usinas, setUsinas] = useState<IndicadoresUsina[] | null>(null);
  const [criterio, setCriterio] = useState<ChaveCriterio>("pr");
  const [erro, setErro] = useState<string | null>(null);

  // O Painel Principal é sempre dirigido pelo filtro "Usina ativa" — clicar numa usina aqui define
  // o filtro e leva para lá, em vez de abrir uma página própria por usina.
  function abrirNoPainel(usinaId: string) {
    setUsinaAtivaId(usinaId);
    navigate("/painel");
  }

  useEffect(() => {
    setUsinas(null);
    api
      .get("/painel/resumo", { params: { ano, modo, mes } })
      .then(({ data }) => setUsinas(data.usinas))
      .catch(() => setErro("Não foi possível carregar o ranking."));
  }, [ano, modo, mes]);

  const definicao = CRITERIOS.find((c) => c.chave === criterio)!;

  const { ranqueadas, semDados } = useMemo(() => {
    const lista = usinas ?? [];
    const comValor = lista
      .map((u) => ({ usina: u, valor: definicao.extrair(u) }))
      .filter((x): x is { usina: IndicadoresUsina; valor: number } => x.valor !== null)
      .sort((a, b) => b.valor - a.valor);
    const sem = lista.filter((u) => definicao.extrair(u) === null);
    return { ranqueadas: comValor, semDados: sem };
  }, [usinas, definicao]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Ranking de Ativos</h1>
      <p className="text-os-cinza text-sm mb-4">Mesmo período do filtro da barra superior.</p>

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {usinas === null && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {usinas && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-os-azul-marinho">Ordenar por</label>
            <select
              value={criterio}
              onChange={(e) => setCriterio(e.target.value as ChaveCriterio)}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm"
            >
              {CRITERIOS.map((c) => (
                <option key={c.chave} value={c.chave}>{c.rotulo}</option>
              ))}
            </select>
          </div>

          {usinas.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
              <p className="text-os-cinza text-sm">Nenhuma usina cadastrada ou autorizada.</p>
            </div>
          )}

          {ranqueadas.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead className="bg-os-azul-marinho text-white">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium w-16">Posição</th>
                    <th className="text-left px-4 py-2 font-medium">Usina</th>
                    <th className="text-right px-4 py-2 font-medium">{definicao.rotulo} ({definicao.unidade})</th>
                    <th className="text-left px-4 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {ranqueadas.map(({ usina, valor }, i) => (
                    <tr key={usina.usina.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold ${corPosicao(i + 1)}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => abrirNoPainel(usina.usina.id)} className="text-os-azul-marinho hover:underline">
                          {usina.usina.nome}
                        </button>
                        {usina.usina.municipio && <span className="text-os-cinza text-xs ml-2">{usina.usina.municipio}/{usina.usina.uf}</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(valor, criterio === "geracao" ? 0 : 1)}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-os-cinza">{usina.usina.situacao}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {semDados.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-os-cinza font-medium text-sm mb-2">
                Sem dados para {definicao.rotulo.toLowerCase()} no período ({semDados.length}) — fora da numeração, não tratadas como pior colocação
              </h3>
              <div className="flex flex-wrap gap-2">
                {semDados.map((u) => (
                  <button
                    key={u.usina.id}
                    onClick={() => abrirNoPainel(u.usina.id)}
                    className="text-xs rounded-full px-3 py-1.5 border border-slate-300 text-os-cinza hover:text-os-azul-marinho hover:border-os-azul-marinho"
                  >
                    {u.usina.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
