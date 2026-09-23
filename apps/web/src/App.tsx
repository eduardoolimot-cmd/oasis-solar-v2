import { Navigate, Route, Routes } from "react-router-dom";
import { RotaAdmin, RotaProtegida } from "./components/RotaProtegida";
import { AuthProvider } from "./context/AuthContext";
import { FiltrosProvider } from "./context/FiltrosContext";
import { AppLayout } from "./layouts/AppLayout";
import { Administracao } from "./pages/Administracao";
import { CadastroUsinas } from "./pages/CadastroUsinas";
import { Comparativo } from "./pages/Comparativo";
import { ConfiguracoesUsina } from "./pages/ConfiguracoesUsina";
import { DashboardUsina } from "./pages/DashboardUsina";
import { Financeiro } from "./pages/Financeiro";
import { LancamentoDados } from "./pages/LancamentoDados";
import { Login } from "./pages/Login";
import { ManutencaoEstoque } from "./pages/ManutencaoEstoque";
import { Notificacoes } from "./pages/Notificacoes";
import { PainelPrincipal } from "./pages/PainelPrincipal";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RankingAtivos } from "./pages/RankingAtivos";
import { Relatorios } from "./pages/Relatorios";
import { Usuarios } from "./pages/Usuarios";

export default function App() {
  return (
    <AuthProvider>
      <FiltrosProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RotaProtegida />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/painel" replace />} />
              <Route path="/painel" element={<PainelPrincipal />} />
              <Route path="/usinas" element={<CadastroUsinas />} />
              <Route path="/usinas/nova" element={<ConfiguracoesUsina />} />
              <Route path="/usinas/:usinaId/configuracoes" element={<ConfiguracoesUsina />} />
              <Route path="/usinas/:usinaId/dashboard" element={<DashboardUsina />} />
              <Route path="/lancamentos" element={<LancamentoDados />} />
              <Route path="/manutencao" element={<ManutencaoEstoque />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/comparativo" element={<Comparativo />} />
              <Route path="/ranking" element={<RankingAtivos />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route element={<RotaAdmin />}>
                <Route path="/notificacoes" element={<Notificacoes />} />
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/administracao" element={<Administracao />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/painel" replace />} />
        </Routes>
      </FiltrosProvider>
    </AuthProvider>
  );
}
