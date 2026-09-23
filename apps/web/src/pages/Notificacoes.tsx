import { useEffect, useState } from "react";
import { api } from "../api/client";
import { MODULOS } from "../theme/permissoes";

interface LogAuditoria {
  id: string;
  criadoEm: string;
  modulo: string;
  entidade: string;
  acao: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  justificativa: string | null;
  usinaId: string | null;
  usuario: { nome: string } | null;
}

interface Alerta {
  tipo: "ESTOQUE_BAIXO" | "OS_VENCIDA" | "PREVENTIVA_VENCIDA" | "PARADA_PROLONGADA";
  severidade: "ALTA" | "MEDIA";
  usinaId: string;
  usinaNome: string;
  mensagem: string;
  referenciaId: string;
  data: string;
}

interface UsinaOpcao {
  id: string;
  nome: string;
}

const ROTULO_TIPO_ALERTA: Record<Alerta["tipo"], string> = {
  ESTOQUE_BAIXO: "Estoque abaixo do mínimo",
  OS_VENCIDA: "Ordem de Serviço vencida",
  PREVENTIVA_VENCIDA: "Preventiva vencida",
  PARADA_PROLONGADA: "Parada prolongada",
};

function corSeveridade(s: Alerta["severidade"]): string {
  return s === "ALTA" ? "border-l-4 border-os-estado-vermelho bg-os-estado-vermelho/5" : "border-l-4 border-os-amarelo bg-os-amarelo/10";
}

export function Notificacoes() {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [carregandoLogs, setCarregandoLogs] = useState(true);
  const [temMais, setTemMais] = useState(true);

  const [usinas, setUsinas] = useState<UsinaOpcao[]>([]);
  const [filtroModulo, setFiltroModulo] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroUsina, setFiltroUsina] = useState("");
  const [filtroInicio, setFiltroInicio] = useState("");
  const [filtroFim, setFiltroFim] = useState("");
  const [usuarios, setUsuarios] = useState<UsinaOpcao[]>([]);
  const [filtroUsuario, setFiltroUsuario] = useState("");

  useEffect(() => {
    api.get("/auditoria/alertas").then(({ data }) => setAlertas(data.alertas));
    api.get<UsinaOpcao[]>("/usinas").then(({ data }) => setUsinas(data));
    api.get<UsinaOpcao[]>("/usuarios").then(({ data }) => setUsuarios(data));
  }, []);

  function paramsAtuais(antesDe?: string) {
    return {
      usuarioId: filtroUsuario || undefined,
      modulo: filtroModulo || undefined,
      acao: filtroAcao || undefined,
      usinaId: filtroUsina || undefined,
      inicio: filtroInicio || undefined,
      fim: filtroFim || undefined,
      antesDe,
      limite: 100,
    };
  }

  function carregarLogs() {
    setCarregandoLogs(true);
    api.get<LogAuditoria[]>("/auditoria", { params: paramsAtuais() }).then(({ data }) => {
      setLogs(data);
      setTemMais(data.length === 100);
      setCarregandoLogs(false);
    });
  }

  useEffect(carregarLogs, [filtroModulo, filtroAcao, filtroUsina, filtroUsuario, filtroInicio, filtroFim]);

  async function carregarMais() {
    if (logs.length === 0) return;
    setCarregandoLogs(true);
    const { data } = await api.get<LogAuditoria[]>("/auditoria", { params: paramsAtuais(logs[logs.length - 1].id) });
    setLogs((atual) => [...atual, ...data]);
    setTemMais(data.length === 100);
    setCarregandoLogs(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-1">Notificações e Histórico</h1>
      <p className="text-os-cinza text-sm mb-4">
        Alertas calculados a partir do estado atual do sistema e histórico de auditoria imutável —
        nenhum registro pode ser editado ou apagado pela interface.
      </p>

      <div className="mb-6">
        <h2 className="text-os-azul-marinho font-medium text-sm mb-2">
          Alertas {alertas !== null && `(${alertas.length})`}
        </h2>
        {alertas === null && <p className="text-os-cinza text-sm">Carregando...</p>}
        {alertas?.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-lg p-4 text-os-cinza text-sm">Nenhum alerta no momento.</div>
        )}
        {alertas && alertas.length > 0 && (
          <div className="flex flex-col gap-2">
            {alertas.map((a) => (
              <div key={`${a.tipo}-${a.referenciaId}`} className={`rounded-md p-3 text-sm ${corSeveridade(a.severidade)}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-os-azul-marinho">{ROTULO_TIPO_ALERTA[a.tipo]} · {a.usinaNome}</span>
                  <span className="text-os-cinza text-xs">{new Date(a.data).toLocaleDateString("pt-BR")}</span>
                </div>
                <p className="text-os-cinza text-xs mt-0.5">{a.mensagem}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="text-os-azul-marinho font-medium text-sm mb-2">Histórico de auditoria</h2>
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3 flex flex-wrap gap-2">
        <select value={filtroUsina} onChange={(e) => setFiltroUsina(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
          <option value="">Todas as usinas</option>
          {usinas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
          <option value="">Todos os usuários</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
          <option value="">Todos os módulos</option>
          {MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs">
          <option value="">Todas as ações</option>
          <option value="CRIACAO">Criação</option>
          <option value="EDICAO">Edição</option>
          <option value="CANCELAMENTO">Cancelamento</option>
          <option value="DESATIVACAO">Desativação</option>
          <option value="MOVIMENTACAO">Movimentação</option>
          <option value="ACESSO">Acesso</option>
        </select>
        <input type="date" value={filtroInicio} onChange={(e) => setFiltroInicio(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
        <input type="date" value={filtroFim} onChange={(e) => setFiltroFim(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs" />
        {(filtroUsina || filtroUsuario || filtroModulo || filtroAcao || filtroInicio || filtroFim) && (
          <button
            onClick={() => { setFiltroUsina(""); setFiltroUsuario(""); setFiltroModulo(""); setFiltroAcao(""); setFiltroInicio(""); setFiltroFim(""); }}
            className="text-os-azul-marinho text-xs underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {carregandoLogs && logs.length === 0 && <p className="p-4 text-os-cinza text-sm">Carregando...</p>}
        {!carregandoLogs && logs.length === 0 && <p className="p-4 text-os-cinza text-sm">Nenhum evento encontrado com estes filtros.</p>}
        {logs.map((log) => (
          <div key={log.id} className="p-4 text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-os-azul-marinho">
                {log.usuario?.nome ?? "Sistema"} · {log.modulo} · {log.entidade} · {log.acao}
              </span>
              <span className="text-os-cinza text-xs">
                {new Date(log.criadoEm).toLocaleString("pt-BR")}
              </span>
            </div>
            {log.justificativa && <p className="text-os-cinza text-xs">{log.justificativa}</p>}
            {(log.valorAnterior || log.valorNovo) && (
              <p className="text-xs text-os-cinza mt-1">
                {log.campo ? `${log.campo}: ` : ""}
                {log.valorAnterior ?? "—"} → {log.valorNovo ?? "—"}
              </p>
            )}
          </div>
        ))}
      </div>

      {temMais && logs.length > 0 && (
        <div className="text-center mt-3">
          <button onClick={carregarMais} disabled={carregandoLogs} className="text-os-azul-marinho text-sm underline disabled:opacity-60">
            {carregandoLogs ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}
    </div>
  );
}
