import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useState } from "react";

// Filtro ANO compartilhado entre abas — ver Especificação, "Navegação e funcionamento geral" e
// "Uso do filtro ANO". Nunca mistura o mesmo mês de anos diferentes; "Ano completo" agrega o ano
// inteiro. Um intervalo personalizado sobrepõe a seleção de mês.

export type ModoPeriodo = "ano_completo" | "mes" | "intervalo";

interface FiltrosValue {
  usinaAtivaId: string | null;
  setUsinaAtivaId: Dispatch<SetStateAction<string | null>>;
  /// "Todas as usinas" no Painel Principal (soma da carteira). Só o Painel Principal usa: as demais
  /// telas precisam de uma usina específica e continuam lendo `usinaAtivaId`, que é preservado.
  visaoConsolidada: boolean;
  setVisaoConsolidada: (valor: boolean) => void;
  ano: number;
  setAno: (ano: number) => void;
  modo: ModoPeriodo;
  setModo: (modo: ModoPeriodo) => void;
  mes: number; // 1-12, relevante quando modo === 'mes'
  setMes: (mes: number) => void;
  intervalo: { inicio: string; fim: string } | null; // DD/MM/AAAA, relevante quando modo === 'intervalo'
  setIntervalo: (intervalo: { inicio: string; fim: string } | null) => void;
}

const FiltrosContext = createContext<FiltrosValue | undefined>(undefined);

export function FiltrosProvider({ children }: { children: ReactNode }) {
  const [usinaAtivaId, setUsinaAtivaId] = useState<string | null>(null);
  const [visaoConsolidada, setVisaoConsolidada] = useState(false);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [modo, setModo] = useState<ModoPeriodo>("ano_completo");
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [intervalo, setIntervalo] = useState<{ inicio: string; fim: string } | null>(null);

  return (
    <FiltrosContext.Provider
      value={{ usinaAtivaId, setUsinaAtivaId, visaoConsolidada, setVisaoConsolidada, ano, setAno, modo, setModo, mes, setMes, intervalo, setIntervalo }}
    >
      {children}
    </FiltrosContext.Provider>
  );
}

export function useFiltros() {
  const ctx = useContext(FiltrosContext);
  if (!ctx) throw new Error("useFiltros deve ser usado dentro de FiltrosProvider");
  return ctx;
}
