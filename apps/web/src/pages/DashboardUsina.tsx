import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { PainelUsina } from "../components/dashboard/PainelUsina";
import { useFiltros } from "../context/FiltrosContext";

// Permalink para uma usina específica, independente do filtro "Usina ativa" (ex.: link enviado
// para alguém, ou aberto direto por URL) — o Painel Principal (/painel) é a tela do dia a dia,
// sempre dirigida pelo filtro da barra superior.
export function DashboardUsina() {
  const { usinaId } = useParams<{ usinaId: string }>();
  const { setUsinaAtivaId } = useFiltros();

  // Mantém o filtro da barra superior em sincronia com a usina deste permalink, para que o
  // seletor não fique "desencontrado" do que está na tela.
  useEffect(() => {
    if (usinaId) setUsinaAtivaId(usinaId);
  }, [usinaId, setUsinaAtivaId]);

  if (!usinaId) return null;
  return <PainelUsina usinaId={usinaId} />;
}
