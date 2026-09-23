import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { AbaDisponibilidade } from "./AbaDisponibilidade";
import { AbaFC } from "./AbaFC";
import { AbaGeracaoBruta } from "./AbaGeracaoBruta";
import { AbaIrradiacao } from "./AbaIrradiacao";
import { AbaPR } from "./AbaPR";

interface UsinaResumo {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
  potenciaDcKwp: number;
}

const ABAS = [
  { chave: "geracao", rotulo: "Geração de Energia Bruta" },
  { chave: "irradiacao", rotulo: "Irradiação" },
  { chave: "pr", rotulo: "Performance Ratio (PR)" },
  { chave: "fc", rotulo: "Fator de Capacidade (FC)" },
  { chave: "disponibilidade", rotulo: "Disponibilidade" },
] as const;

type Chave = (typeof ABAS)[number]["chave"];

interface Props {
  usinaId: string;
}

// Corpo do "painel" de uma usina — as 5 abas técnicas (Geração Bruta, Irradiação, PR, FC,
// Disponibilidade). Reaproveitado tanto pelo Painel Principal (dirigido pelo filtro global "Usina
// ativa" da barra superior) quanto pelo link direto /usinas/:usinaId/dashboard (permalink para uma
// usina específica, independente do filtro).
export function PainelUsina({ usinaId }: Props) {
  const [usina, setUsina] = useState<UsinaResumo | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<Chave>("geracao");

  // Intervalo de datas compartilhado entre as abas — "Preservar os filtros ao alternar abas da
  // mesma usina" (especificação). Acesso inicial: mês atual até a data atual.
  const hoje = new Date();
  const [inicio, setInicio] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));

  useEffect(() => {
    setUsina(null);
    api.get<UsinaResumo>(`/usinas/${usinaId}`).then(({ data }) => setUsina(data));
  }, [usinaId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-os-azul-marinho">
            {usina ? usina.nome : "Carregando..."}
          </h1>
          {usina && (
            <p className="text-os-cinza text-sm mt-1">
              {usina.municipio ? `${usina.municipio}/${usina.uf}` : "Localização não informada"} · {(usina.potenciaDcKwp / 1000).toFixed(3)} MWp
            </p>
          )}
        </div>
        <Link to={`/usinas/${usinaId}/configuracoes`} className="text-os-azul-marinho text-sm underline">
          Editar cadastro
        </Link>
      </div>

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

      {abaAtiva === "geracao" && <AbaGeracaoBruta usinaId={usinaId} inicio={inicio} fim={fim} onAlterarIntervalo={(i, f) => { setInicio(i); setFim(f); }} />}
      {abaAtiva === "irradiacao" && <AbaIrradiacao usinaId={usinaId} inicio={inicio} fim={fim} onAlterarIntervalo={(i, f) => { setInicio(i); setFim(f); }} />}
      {abaAtiva === "pr" && <AbaPR usinaId={usinaId} inicio={inicio} fim={fim} onAlterarIntervalo={(i, f) => { setInicio(i); setFim(f); }} />}
      {abaAtiva === "fc" && <AbaFC usinaId={usinaId} inicio={inicio} fim={fim} onAlterarIntervalo={(i, f) => { setInicio(i); setFim(f); }} />}
      {abaAtiva === "disponibilidade" && <AbaDisponibilidade usinaId={usinaId} inicio={inicio} fim={fim} onAlterarIntervalo={(i, f) => { setInicio(i); setFim(f); }} />}
    </div>
  );
}
