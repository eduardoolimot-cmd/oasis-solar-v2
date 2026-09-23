import { useState } from "react";
import { Outlet } from "react-router-dom";
import { FundoUsina } from "../components/FundoUsina";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const CHAVE_RECOLHIDA = "oasis_solar_menu_recolhido";

export function AppLayout() {
  const [recolhida, setRecolhida] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDA) === "1";
    } catch {
      return false;
    }
  });
  const [gavetaAberta, setGavetaAberta] = useState(false);

  function alternarRecolhida() {
    setRecolhida((atual) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDA, atual ? "0" : "1");
      } catch {
        /* preferência só vale nesta sessão */
      }
      return !atual;
    });
  }

  return (
    <div className="flex min-h-screen bg-[#F3F6FA] isolate">
      <FundoUsina />
      <Sidebar recolhida={recolhida} onAlternarRecolhida={alternarRecolhida} gavetaAberta={gavetaAberta} onFecharGaveta={() => setGavetaAberta(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onAbrirMenu={() => setGavetaAberta(true)} />
        <main className="flex-1 p-4 md:p-6 min-w-0">
          <Outlet />
        </main>
        <footer className="px-4 md:px-6 py-3 text-os-cinza text-xs flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-200/70">
          <span>OASIS SOLAR — Gestão de usinas solares</span>
          <span>Versão {__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}
