import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RotaProtegida() {
  const { usuario, carregando } = useAuth();
  if (carregando) return <div className="min-h-screen flex items-center justify-center text-os-cinza">Carregando...</div>;
  if (!usuario) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RotaAdmin() {
  const { usuario } = useAuth();
  if (usuario?.perfil !== "ADMIN") return <Navigate to="/painel" replace />;
  return <Outlet />;
}
