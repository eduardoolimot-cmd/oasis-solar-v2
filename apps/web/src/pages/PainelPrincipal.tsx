import { PainelConsolidado } from "../components/dashboard/PainelConsolidado";
import { PainelUsina } from "../components/dashboard/PainelUsina";
import { useFiltros } from "../context/FiltrosContext";

// Painel Principal — acompanha a usina selecionada no filtro "Usina ativa" da barra superior
// (mesmo mecanismo usado por Lançamento de Dados e Manutenção e Estoque), nunca por uma seleção
// feita numa tabela de outra tela: trocar a usina no filtro é a única forma de trocar o que este
// painel mostra. "Todas as usinas" (só aqui) mostra a carteira somada.
export function PainelPrincipal() {
  const { usinaAtivaId, visaoConsolidada } = useFiltros();

  if (visaoConsolidada) return <PainelConsolidado />;

  if (!usinaAtivaId) {
    return <p className="text-os-cinza text-sm">Selecione uma usina na barra superior para ver o painel.</p>;
  }

  return <PainelUsina usinaId={usinaAtivaId} />;
}
