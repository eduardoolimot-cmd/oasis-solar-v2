import { useState } from "react";
import { AbaCalendario } from "../components/manutencao/AbaCalendario";
import { AbaEstoque } from "../components/manutencao/AbaEstoque";
import { AbaKanban } from "../components/manutencao/AbaKanban";
import { AbaPreventivas } from "../components/manutencao/AbaPreventivas";
import { useFiltros } from "../context/FiltrosContext";

const ABAS = [
  { chave: "kanban", rotulo: "Ordens de Serviço" },
  { chave: "calendario", rotulo: "Calendário" },
  { chave: "preventivas", rotulo: "Preventivas" },
  { chave: "estoque", rotulo: "Estoque" },
] as const;

type Chave = (typeof ABAS)[number]["chave"];

// Módulo usina-scoped sem :usinaId na URL — segue o mesmo padrão de Lançamento de Dados: dirigido
// pelo filtro global "Usina ativa" da barra superior, não por um seletor próprio.
export function ManutencaoEstoque() {
  const { usinaAtivaId } = useFiltros();
  const [abaAtiva, setAbaAtiva] = useState<Chave>("kanban");

  if (!usinaAtivaId) {
    return <p className="text-os-cinza text-sm">Selecione uma usina na barra superior para gerenciar manutenção e estoque.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-4">Manutenção e Estoque</h1>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200">
        {ABAS.map((aba) => (
          <button
            key={aba.chave}
            onClick={() => setAbaAtiva(aba.chave)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              abaAtiva === aba.chave ? "border-os-laranja text-os-azul-marinho font-medium" : "border-transparent text-os-cinza hover:text-os-azul-marinho"
            }`}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      {abaAtiva === "kanban" && <AbaKanban usinaId={usinaAtivaId} />}
      {abaAtiva === "calendario" && <AbaCalendario usinaId={usinaAtivaId} />}
      {abaAtiva === "preventivas" && <AbaPreventivas usinaId={usinaAtivaId} />}
      {abaAtiva === "estoque" && <AbaEstoque usinaId={usinaAtivaId} />}
    </div>
  );
}
