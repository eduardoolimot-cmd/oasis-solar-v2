import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { api, definirToken, obterToken } from "../api/client";

interface Permissao {
  usinaId: string | null;
  incluirFuturas: boolean;
  modulo: string;
  acao: string;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: "ADMIN" | "USUARIO";
  permissoes: Permissao[];
}

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  sair: () => void;
  temPermissao: (modulo: string, acao: string, usinaId?: string | null) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarUsuario() {
    if (!obterToken()) {
      setCarregando(false);
      return;
    }
    try {
      const { data } = await api.get<Usuario>("/auth/me");
      setUsuario(data);
    } catch {
      definirToken(null);
      setUsuario(null);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarUsuario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, senha: string) {
    const { data } = await api.post("/auth/login", { email, senha });
    definirToken(data.token);
    await carregarUsuario();
  }

  function sair() {
    definirToken(null);
    setUsuario(null);
  }

  function temPermissao(modulo: string, acao: string, usinaId: string | null = null) {
    if (!usuario) return false;
    if (usuario.perfil === "ADMIN") return true;
    return usuario.permissoes.some((p) => {
      if (p.modulo !== modulo || p.acao !== acao) return false;
      if (usinaId === null) return true; // checagem genérica de acesso ao módulo
      return p.usinaId === usinaId || p.usinaId === null;
    });
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, sair, temPermissao }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
