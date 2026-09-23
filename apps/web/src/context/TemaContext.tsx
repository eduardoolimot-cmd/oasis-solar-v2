import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

type Tema = "claro" | "escuro";

interface TemaContextValor {
  tema: Tema;
  alternarTema: () => void;
}

const CHAVE = "oasis_solar_tema";
const TemaContext = createContext<TemaContextValor | null>(null);

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "claro" || salvo === "escuro") return salvo;
  } catch {
    /* localStorage indisponível — segue a preferência do sistema */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "escuro");
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {
      /* sem persistência — vale só para esta sessão */
    }
  }, [tema]);

  const alternarTema = useCallback(() => setTema((atual) => (atual === "escuro" ? "claro" : "escuro")), []);

  return <TemaContext.Provider value={{ tema, alternarTema }}>{children}</TemaContext.Provider>;
}

export function useTema(): TemaContextValor {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error("useTema deve ser usado dentro de TemaProvider");
  return ctx;
}
