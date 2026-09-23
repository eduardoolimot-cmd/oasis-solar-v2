import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import { useFiltros } from "../context/FiltrosContext";
import { exportarGraficoPng } from "../lib/exportarGrafico";

// Comparativo entre usinas — reaproveita o mesmo GET /painel/resumo do Painel Principal (mesmos
// indicadores já calculados ali: soma de numeradores/denominadores, nunca média de percentuais;
// PR pareado dia a dia) em vez de recalcular em outra rota, evitando duas fontes de verdade para o
// mesmo número. Usa o mesmo filtro de período global (barra superior) do Painel Principal.

interface IndicadoresUsina {
  usina: { id: string; nome: string; situacao: string };
  geracao: { realizadaKwh: number | null; previstaKwh: number | null; diferencaPercentual: number | null };
  pr: number | null;
  ipe: number | null;
  rendimentoEspecificoKwhKwp: number | null;
}

function fmt(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined) return "Sem dados";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function abreviarNome(nome: string, max = 16): string {
  const semPrefixo = nome.replace(/^UFV\s+/i, "");
  return semPrefixo.length > max ? `${semPrefixo.slice(0, max - 1)}…` : semPrefixo;
}

function Grafico({ titulo, dados, chaves }: { titulo: string; dados: Record<string, unknown>[]; chaves: { chave: string; nome: string; cor: string }[] }) {
  const areaRef = useRef<HTMLDivElement>(null);

  async function exportar() {
    if (!areaRef.current) return;
    try {
      const nome = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      await exportarGraficoPng(areaRef.current, titulo, `comparativo_${nome}`);
    } catch (err: unknown) {
      alert((err as Error).message || "Não foi possível exportar o gráfico.");
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-os-azul-marinho font-medium text-sm">{titulo}</h3>
        <button onClick={exportar} className="text-xs border border-os-azul-marinho text-os-azul-marinho rounded-md px-2.5 py-1 hover:bg-os-azul-marinho hover:text-white transition-colors shrink-0">
          Exportar PNG
        </button>
      </div>
      <div ref={areaRef}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={dados} margin={{ left: 4, right: 4 }}>
          <CartesianGrid stroke="#EEF2F6" vertical={false} />
          <XAxis dataKey="nome" tick={{ fontSize: 11, fill: "#878787" }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={{ fontSize: 11, fill: "#878787" }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {chaves.map((c) => (
            <Bar key={c.chave} dataKey={c.chave} name={c.nome} fill={c.cor} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}

export function Comparativo() {
  const { ano, modo, mes } = useFiltros();
  const [usinas, setUsinas] = useState<IndicadoresUsina[] | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setUsinas(null);
    api
      .get("/painel/resumo", { params: { ano, modo, mes } })
      .then(({ data }) => {
        setUsinas(data.usinas);
        // Seleciona todas por padrão a cada novo período — evita comparar contra uma usina que
        // não tinha dado no período anterior e o usuário nem perceber que ficou de fora.
        setSelecionadas(new Set(data.usinas.map((u: IndicadoresUsina) => u.usina.id)));
      })
      .catch(() => setErro("Não foi possível carregar o comparativo."));
  }, [ano, modo, mes]);

  function alternar(id: string) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const usinasSelecionadas = useMemo(
    () => (usinas ?? []).filter((u) => selecionadas.has(u.usina.id)),
    [usinas, selecionadas]
  );

  const dadosGeracao = usinasSelecionadas.map((u) => ({
    nome: abreviarNome(u.usina.nome),
    realizada: u.geracao.realizadaKwh ?? undefined,
    prevista: u.geracao.previstaKwh ?? undefined,
  }));
  const dadosPr = usinasSelecionadas.map((u) => ({ nome: abreviarNome(u.usina.nome), pr: u.pr ?? undefined }));
  const dadosIpe = usinasSelecionadas.map((u) => ({ nome: abreviarNome(u.usina.nome), ipe: u.ipe ?? undefined }));
  const dadosRe = usinasSelecionadas.map((u) => ({ nome: abreviarNome(u.usina.nome), re: u.rendimentoEspecificoKwhKwp ?? undefined }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Comparativo entre usinas</h1>
      <p className="text-os-cinza text-sm mb-4">
        Mesmo período do filtro da barra superior. Usinas sem barra visível em um gráfico não têm o
        indicador calculável no período — nunca tratado como zero.
      </p>

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {usinas === null && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {usinas && usinas.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <p className="text-os-cinza text-sm">Nenhuma usina cadastrada ou autorizada.</p>
        </div>
      )}

      {usinas && usinas.length > 0 && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-os-azul-marinho font-medium text-sm">Usinas no comparativo ({usinasSelecionadas.length} de {usinas.length})</h3>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setSelecionadas(new Set(usinas.map((u) => u.usina.id)))} className="text-os-azul-marinho underline">
                  Selecionar todas
                </button>
                <button onClick={() => setSelecionadas(new Set())} className="text-os-azul-marinho underline">
                  Limpar seleção
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {usinas.map((u) => (
                <button
                  key={u.usina.id}
                  onClick={() => alternar(u.usina.id)}
                  className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                    selecionadas.has(u.usina.id)
                      ? "bg-os-azul-marinho text-white border-os-azul-marinho"
                      : "border-slate-300 text-os-cinza"
                  }`}
                >
                  {u.usina.nome}
                </button>
              ))}
            </div>
          </div>

          {usinasSelecionadas.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
              <p className="text-os-cinza text-sm">Selecione ao menos uma usina para comparar.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <Grafico
                  titulo="Geração — realizada vs. prevista (kWh)"
                  dados={dadosGeracao}
                  chaves={[
                    { chave: "realizada", nome: "Realizada", cor: "#00386D" },
                    { chave: "prevista", nome: "Prevista", cor: "#878787" },
                  ]}
                />
                <Grafico
                  titulo="Performance Ratio — PR (%)"
                  dados={dadosPr}
                  chaves={[{ chave: "pr", nome: "PR", cor: "#EE7528" }]}
                />
                <Grafico
                  titulo="Aderência à previsão — IPE (%)"
                  dados={dadosIpe}
                  chaves={[{ chave: "ipe", nome: "IPE", cor: "#45A3DB" }]}
                />
                <Grafico
                  titulo="Rendimento específico (kWh/kWp)"
                  dados={dadosRe}
                  chaves={[{ chave: "re", nome: "RE", cor: "#FBBB21" }]}
                />
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-os-azul-marinho text-white">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Usina</th>
                      <th className="text-right px-4 py-2 font-medium">Realizada (kWh)</th>
                      <th className="text-right px-4 py-2 font-medium">Prevista (kWh)</th>
                      <th className="text-right px-4 py-2 font-medium">PR</th>
                      <th className="text-right px-4 py-2 font-medium">IPE</th>
                      <th className="text-right px-4 py-2 font-medium">RE (kWh/kWp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usinasSelecionadas.map((u, i) => (
                      <tr key={u.usina.id} className={i % 2 === 1 ? "bg-slate-50" : ""}>
                        <td className="px-4 py-2">{u.usina.nome}</td>
                        <td className="px-4 py-2 text-right">{fmt(u.geracao.realizadaKwh, 0)}</td>
                        <td className="px-4 py-2 text-right">{fmt(u.geracao.previstaKwh, 0)}</td>
                        <td className="px-4 py-2 text-right">{u.pr !== null ? `${fmt(u.pr, 1)}%` : "Sem dados"}</td>
                        <td className="px-4 py-2 text-right">{u.ipe !== null ? `${fmt(u.ipe, 1)}%` : "Sem dados"}</td>
                        <td className="px-4 py-2 text-right">{fmt(u.rendimentoEspecificoKwhKwp, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
