import { PanelLeftClose, PanelLeftOpen, Sun, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ITENS_MENU } from "../theme/modulos";

interface Props {
  recolhida: boolean;
  onAlternarRecolhida: () => void;
  gavetaAberta: boolean; // celular/tablet: menu como gaveta sobre o conteúdo
  onFecharGaveta: () => void;
}

export function Sidebar({ recolhida, onAlternarRecolhida, gavetaAberta, onFecharGaveta }: Props) {
  const { usuario } = useAuth();
  const itens = ITENS_MENU.filter((item) => !item.somenteAdmin || usuario?.perfil === "ADMIN");

  return (
    <>
      {gavetaAberta && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={onFecharGaveta} aria-hidden />}

      {/* Gradiente vertical (navy institucional -> quase preto), inspirado na sidebar em gradiente
          do design de referência Velzon (docs/design.md) — mantém a cor da marca, sem adotar o
          índigo do template original. */}
      <aside
        className={`bg-gradient-to-b from-os-azul-marinho to-[#001220] text-white flex flex-col h-screen fixed lg:sticky top-0 left-0 z-40 shrink-0 transition-all duration-200 shadow-card-lg
          ${gavetaAberta ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
          w-64 ${recolhida ? "lg:w-[72px]" : "lg:w-64"}`}
      >
        <div className={`h-16 flex items-center border-b border-white/10 ${recolhida ? "lg:justify-center px-5 lg:px-0" : "px-5"} justify-between`}>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-os-laranja flex items-center justify-center shrink-0">
              <Sun size={20} className="text-white" />
            </span>
            <span className={`text-lg font-semibold tracking-wide truncate ${recolhida ? "lg:hidden" : ""}`}>OASIS SOLAR</span>
          </span>
          <button onClick={onFecharGaveta} className="lg:hidden text-white/80 hover:text-white" aria-label="Fechar menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3 flex flex-col gap-1">
          {itens.map((item) => {
            const Icone = item.icone;
            return (
              <NavLink
                key={item.chave}
                to={item.rota}
                title={recolhida ? item.rotulo : undefined}
                onClick={onFecharGaveta}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${recolhida ? "lg:justify-center" : ""} ${
                    isActive ? "bg-white/15 font-medium text-white shadow-sm ring-1 ring-white/10" : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icone size={19} className={`shrink-0 ${isActive ? "text-os-laranja" : ""}`} />
                    <span className={`truncate ${recolhida ? "lg:hidden" : ""}`}>{item.rotulo}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="hidden lg:block border-t border-white/10 p-3">
          <button
            onClick={onAlternarRecolhida}
            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors ${recolhida ? "justify-center" : ""}`}
            title={recolhida ? "Expandir menu" : "Recolher menu"}
          >
            {recolhida ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            {!recolhida && <span>Recolher menu</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
