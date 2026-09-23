import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { ControlesAba } from "./ControlesAba";
import { fmt, KpiCard } from "./KpiCard";

interface Evento {
  id: string;
  escopo: "USINA" | "EQUIPAMENTO";
  skid: { id: string; nome: string } | null;
  tipo: "GERACAO" | "COMUNICACAO";
  inicio: string;
  fim: string | null;
  motivo: string | null;
}

interface Dados {
  usina: { id: string; nome: string };
  kpis: {
    disponibilidadeGeracaoPct: number | null;
    disponibilidadeComunicacaoPct: number | null;
    mttrHoras: number | null;
    mtbfHoras: number | null;
    numeroDeParadas: number;
  };
  eventos: Evento[];
  avisoSemHistorico: string | null;
  ultimoProcessamento: { data: string; usuario: string | null } | null;
}

interface Props {
  usinaId: string;
  inicio: string;
  fim: string;
  onAlterarIntervalo: (inicio: string, fim: string) => void;
}

function formatarDataHoraBr(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export function AbaDisponibilidade({ usinaId, inicio, fim, onAlterarIntervalo }: Props) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [tipo, setTipo] = useState<"GERACAO" | "COMUNICACAO">("GERACAO");
  const [inicioEvento, setInicioEvento] = useState("");
  const [fimEvento, setFimEvento] = useState("");
  const [motivo, setMotivo] = useState("");

  function carregar() {
    setErro(null);
    api
      .get(`/usinas/${usinaId}/disponibilidade`, { params: { inicio, fim } })
      .then(({ data }) => setDados(data))
      .catch((err) => setErro(err?.response?.data?.erro || "Não foi possível carregar."));
  }

  useEffect(carregar, [usinaId, inicio, fim]);

  async function registrarEvento() {
    if (!inicioEvento) return;
    try {
      await api.post(`/usinas/${usinaId}/eventos`, {
        escopo: "USINA",
        tipo,
        inicio: new Date(inicioEvento).toISOString(),
        fim: fimEvento ? new Date(fimEvento).toISOString() : null,
        motivo: motivo || undefined,
      });
      setInicioEvento("");
      setFimEvento("");
      setMotivo("");
      setMostrarForm(false);
      carregar();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { erro?: string } } })?.response?.data?.erro || "Não foi possível registrar o evento.");
    }
  }

  async function encerrarEvento(eventoId: string) {
    await api.post(`/usinas/${usinaId}/eventos/${eventoId}/encerrar`);
    carregar();
  }

  return (
    <div>
      <ControlesAba
        inicio={inicio}
        fim={fim}
        onAlterarIntervalo={onAlterarIntervalo}
        usinaId={usinaId}
        rotaReprocessar="/usinas/:usinaId/disponibilidade/reprocessar"
        ultimoProcessamento={dados?.ultimoProcessamento ?? null}
        onReprocessado={carregar}
      />

      {erro && <p className="text-os-estado-vermelho text-sm mb-4">{erro}</p>}
      {!dados && !erro && <p className="text-os-cinza text-sm">Carregando...</p>}

      {dados && (
        <>
          {dados.avisoSemHistorico && (
            <div className="bg-os-amarelo/20 border border-os-amarelo text-os-azul-marinho text-xs rounded-md px-4 py-2 mb-4">
              {dados.avisoSemHistorico}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 max-w-4xl">
            <KpiCard
              titulo="Disponibilidade de geração"
              valor={dados.kpis.disponibilidadeGeracaoPct !== null ? fmt(dados.kpis.disponibilidadeGeracaoPct, 2) : "Sem dados"}
              unidade={dados.kpis.disponibilidadeGeracaoPct !== null ? "%" : undefined}
            />
            <KpiCard
              titulo="Disponibilidade de comunicação"
              valor={dados.kpis.disponibilidadeComunicacaoPct !== null ? fmt(dados.kpis.disponibilidadeComunicacaoPct, 2) : "Sem dados"}
              unidade={dados.kpis.disponibilidadeComunicacaoPct !== null ? "%" : undefined}
            />
            <KpiCard titulo="MTTR" valor={dados.kpis.mttrHoras !== null ? fmt(dados.kpis.mttrHoras, 1) : "Não calculável"} unidade={dados.kpis.mttrHoras !== null ? "h" : undefined} />
            <KpiCard titulo="MTBF" valor={dados.kpis.mtbfHoras !== null ? fmt(dados.kpis.mtbfHoras, 1) : "Não calculável"} unidade={dados.kpis.mtbfHoras !== null ? "h" : undefined} />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-os-azul-marinho font-medium text-sm">Eventos operacionais no período ({dados.eventos.length})</h3>
              <button onClick={() => setMostrarForm((v) => !v)} className="text-os-azul-marinho text-xs underline">
                {mostrarForm ? "Cancelar" : "+ Registrar evento"}
              </button>
            </div>

            {mostrarForm && (
              <div className="flex flex-wrap items-end gap-2 mb-4 bg-slate-50 rounded-md p-3">
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Tipo</label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as "GERACAO" | "COMUNICACAO")} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
                    <option value="GERACAO">Geração</option>
                    <option value="COMUNICACAO">Comunicação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Início</label>
                  <input type="datetime-local" value={inicioEvento} onChange={(e) => setInicioEvento(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <label className="block text-xs text-os-azul-marinho mb-1">Fim (opcional — em andamento se vazio)</label>
                  <input type="datetime-local" value={fimEvento} onChange={(e) => setFimEvento(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-os-azul-marinho mb-1">Motivo</label>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
                </div>
                <button onClick={registrarEvento} className="bg-os-azul-marinho text-white rounded-md px-3 py-1.5 text-xs h-[30px]">
                  Salvar
                </button>
              </div>
            )}

            {dados.eventos.length === 0 ? (
              <p className="text-os-cinza text-sm">Nenhum evento no período.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-os-cinza border-b border-slate-200">
                    <th className="py-1.5 pr-2">Tipo</th>
                    <th className="py-1.5 pr-2">Escopo</th>
                    <th className="py-1.5 pr-2">Início</th>
                    <th className="py-1.5 pr-2">Fim</th>
                    <th className="py-1.5 pr-2">Motivo</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {dados.eventos.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">{e.tipo === "GERACAO" ? "Geração" : "Comunicação"}</td>
                      <td className="py-1.5 pr-2">{e.skid ? e.skid.nome : "Usina"}</td>
                      <td className="py-1.5 pr-2">{formatarDataHoraBr(e.inicio)}</td>
                      <td className="py-1.5 pr-2">
                        {e.fim ? (
                          formatarDataHoraBr(e.fim)
                        ) : (
                          <span className="text-os-estado-vermelho font-medium">Em andamento</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-os-cinza">{e.motivo ?? "—"}</td>
                      <td className="py-1.5">
                        {!e.fim && (
                          <button onClick={() => encerrarEvento(e.id)} className="text-os-azul-marinho underline">
                            Encerrar
                          </button>
                        )}
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
