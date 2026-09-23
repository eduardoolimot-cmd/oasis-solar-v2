import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { SecaoDadosNominais } from "../components/usina/SecaoDadosNominais";
import { SecaoDegradacao } from "../components/usina/SecaoDegradacao";
import { SecaoIdentificacao, UsinaCompleta } from "../components/usina/SecaoIdentificacao";
import { SecaoMetasMensais } from "../components/usina/SecaoMetasMensais";
import { SecaoPrevisaoSkid } from "../components/usina/SecaoPrevisaoSkid";
import { SecaoSkidsInversores } from "../components/usina/SecaoSkidsInversores";
import { useFiltros } from "../context/FiltrosContext";

interface UsinaResumo {
  id: string;
  nome: string;
  municipio: string | null;
  uf: string | null;
}

export function ConfiguracoesUsina() {
  const { usinaId } = useParams();
  const navigate = useNavigate();
  const { setUsinaAtivaId } = useFiltros();
  const novaUsina = !usinaId || usinaId === "nova";

  // Mantém o filtro "Usina ativa" da barra superior em sincronia com a usina exibida aqui (ex.:
  // acesso via link direto), sem interferir no seletor local desta página, que tem sua própria
  // proteção contra perda de alterações não salvas.
  useEffect(() => {
    if (!novaUsina && usinaId) setUsinaAtivaId(usinaId);
  }, [usinaId, novaUsina, setUsinaAtivaId]);

  const [usinas, setUsinas] = useState<UsinaResumo[]>([]);
  const [usina, setUsina] = useState<UsinaCompleta | null>(null);
  const [carregando, setCarregando] = useState(!novaUsina);
  const [pendencias, setPendencias] = useState<Record<string, boolean>>({});
  const [trocaSolicitada, setTrocaSolicitada] = useState<string | null>(null);

  const algumaPendencia = Object.values(pendencias).some(Boolean);

  function marcarPendencia(secao: string, pendente: boolean) {
    setPendencias((atual) => ({ ...atual, [secao]: pendente }));
  }

  useEffect(() => {
    api.get<UsinaResumo[]>("/usinas").then(({ data }) => setUsinas(data));
  }, []);

  useEffect(() => {
    if (novaUsina) {
      setUsina(null);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    api
      .get<UsinaCompleta>(`/usinas/${usinaId}`)
      .then(({ data }) => setUsina(data))
      .finally(() => setCarregando(false));
  }, [usinaId, novaUsina]);

  function irParaUsina(destino: string) {
    if (algumaPendencia) {
      setTrocaSolicitada(destino);
      return;
    }
    navigate(destino === "nova" ? "/usinas/nova" : `/usinas/${destino}/configuracoes`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-os-azul-marinho">Configurações da usina</h1>
          {usina && (
            <p className="text-os-cinza text-sm mt-1">
              {usina.nome} · {usina.municipio ? `${usina.municipio}/${usina.uf}` : "localização não informada"} ·{" "}
              {usina.potenciaDcKwp / 1000} MWp
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-os-azul-marinho">Usina ativa</label>
          <select
            value={novaUsina ? "nova" : usinaId}
            onChange={(e) => irParaUsina(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm min-w-[200px]"
          >
            <option value="nova">+ Nova usina</option>
            {usinas.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {trocaSolicitada && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-30 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-os-azul-marinho font-semibold mb-2">Alterações não salvas</h2>
            <p className="text-os-cinza text-sm mb-5">
              Há seções com alterações pendentes nesta usina. Salve ou descarte antes de trocar — a
              troca nunca salva as alterações na usina de destino.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTrocaSolicitada(null)}
                className="border border-slate-300 rounded-md px-4 py-2 text-sm"
              >
                Continuar editando
              </button>
              <button
                onClick={() => {
                  const destino = trocaSolicitada;
                  setTrocaSolicitada(null);
                  setPendencias({});
                  navigate(destino === "nova" ? "/usinas/nova" : `/usinas/${destino}/configuracoes`);
                }}
                className="bg-os-estado-vermelho text-white rounded-md px-4 py-2 text-sm"
              >
                Descartar e trocar
              </button>
            </div>
          </div>
        </div>
      )}

      {carregando && <p className="text-os-cinza text-sm">Carregando...</p>}

      {!carregando && (
        <>
          <SecaoIdentificacao
            usina={usina}
            novaUsina={novaUsina}
            onSalvo={(salva) => {
              marcarPendencia("identificacao", false);
              if (novaUsina) navigate(`/usinas/${salva.id}/configuracoes`);
              else setUsina(salva);
            }}
            onPendenciaChange={(p) => marcarPendencia("identificacao", p)}
          />

          {!novaUsina && usina && (
            <>
              <SecaoDadosNominais usina={usina} onUsinaAtualizada={setUsina} onPendenciaChange={(p) => marcarPendencia("dadosNominais", p)} />
              <SecaoDegradacao usinaId={usina.id} />
              <SecaoSkidsInversores usinaId={usina.id} />
              <SecaoPrevisaoSkid usinaId={usina.id} />
              <SecaoMetasMensais usinaId={usina.id} />
            </>
          )}

          {!novaUsina && !usina && <p className="text-os-estado-vermelho text-sm">Usina não encontrada.</p>}

          {novaUsina && (
            <p className="text-os-cinza text-sm">
              Salve a Identificação primeiro para liberar as demais seções (Dados nominais, Degradação,
              SKIDs/Inversores, Metas mensais).
            </p>
          )}
        </>
      )}
    </div>
  );
}
