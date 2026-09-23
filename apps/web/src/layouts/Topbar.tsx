import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useFiltros } from "../context/FiltrosContext";
import { useTema } from "../context/TemaContext";

interface UsinaResumo {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
}

const TODAS = "__todas__";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface Props {
  onAbrirMenu: () => void;
}

export function Topbar({ onAbrirMenu }: Props) {
  const { usuario, sair } = useAuth();
  const { tema, alternarTema } = useTema();
  const { usinaAtivaId, setUsinaAtivaId, visaoConsolidada, setVisaoConsolidada, ano, setAno, modo, setModo, mes, setMes } = useFiltros();
  const noPainel = useLocation().pathname === "/painel";
  const [usinas, setUsinas] = useState<UsinaResumo[]>([]);
  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = Array.from({ length: 6 }, (_, i) => anoAtual - i);

  useEffect(() => {
    api
      .get<UsinaResumo[]>("/usinas")
      .then(({ data }) => {
        setUsinas(data);
        // Atualizador funcional: por ser assíncrono, este callback não pode confiar no
        // `usinaAtivaId` capturado no momento em que o efeito foi criado (pode já ter sido
        // definido nesse meio-tempo por uma página que sincroniza o filtro a partir da URL,
        // ex.: DashboardUsina/ConfiguracoesUsina) — só usa a primeira usina como padrão se
        // continuar vazio até aqui.
        if (data.length > 0) setUsinaAtivaId((atual) => atual ?? data[0].id);
      })
      .catch(() => setUsinas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iniciais = (usuario?.nome ?? "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

  return (
    <header className="bg-white border-b border-slate-200 shadow-card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-6 py-3 sticky top-0 z-20">
      <button onClick={onAbrirMenu} className="lg:hidden p-2 -ml-2 rounded-lg text-os-azul-marinho hover:bg-slate-100" aria-label="Abrir menu">
        <Menu size={22} />
      </button>

      <select
        value={noPainel && visaoConsolidada ? TODAS : usinaAtivaId ?? ""}
        onChange={(e) => {
          if (e.target.value === TODAS) {
            setVisaoConsolidada(true);
            return;
          }
          setVisaoConsolidada(false);
          setUsinaAtivaId(e.target.value || null);
        }}
        className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-auto sm:min-w-[220px] order-last sm:order-none focus:outline-none focus:ring-2 focus:ring-os-azul-claro"
      >
        {usinas.length === 0 && <option value="">Nenhuma usina disponível</option>}
        {/* "Todas" só existe no Painel Principal — as demais telas trabalham sempre com uma usina. */}
        {noPainel && usinas.length > 1 && <option value={TODAS}>Todas as usinas (consolidado)</option>}
        {usinas.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
            {u.municipio ? ` · ${u.municipio}/${u.uf ?? ""}` : ""}
          </option>
        ))}
      </select>

      <select
        value={ano}
        onChange={(e) => setAno(Number(e.target.value))}
        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-os-azul-claro"
      >
        {anosDisponiveis.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>

      <select
        value={modo}
        onChange={(e) => setModo(e.target.value as typeof modo)}
        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-os-azul-claro"
      >
        <option value="ano_completo">Ano completo</option>
        <option value="mes">Mês</option>
        <option value="intervalo">Intervalo personalizado</option>
      </select>

      {modo === "mes" && (
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-os-azul-claro"
        >
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1}>{nome}</option>
          ))}
        </select>
      )}

      <div className="ml-auto flex items-center gap-2 text-sm">
        <button
          onClick={alternarTema}
          className="p-2 rounded-lg text-os-azul-marinho hover:bg-slate-100 transition-colors"
          title={tema === "escuro" ? "Modo claro" : "Modo escuro"}
          aria-label={tema === "escuro" ? "Ativar modo claro" : "Ativar modo escuro"}
        >
          {tema === "escuro" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <span className="w-9 h-9 rounded-full bg-os-azul-marinho text-white flex items-center justify-center text-xs font-semibold">{iniciais}</span>
          <span className="hidden md:flex flex-col leading-tight">
            <span className="text-os-azul-marinho font-medium text-[13px]">{usuario?.nome}</span>
            <span className="text-os-cinza text-[11px]">{usuario?.perfil === "ADMIN" ? "Administrador" : "Usuário"}</span>
          </span>
          <button onClick={sair} className="p-2 rounded-lg text-os-azul-marinho hover:bg-slate-100 transition-colors" title="Sair" aria-label="Sair">
            <LogOut size={19} />
          </button>
        </div>
      </div>
    </header>
  );
}
