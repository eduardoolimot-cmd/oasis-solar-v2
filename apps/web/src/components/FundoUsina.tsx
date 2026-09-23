import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api, carregarImagemAutenticada } from "../api/client";
import { useFiltros } from "../context/FiltrosContext";

/// Disparado pelo cadastro da usina quando a foto é enviada/substituída/removida, para o fundo
/// acompanhar sem precisar recarregar a página.
export const EVENTO_FOTO_USINA = "oasis:foto-usina-alterada";

// caminho da foto -> object URL. Cada upload gera um nome de arquivo novo, então o caminho identifica
// a versão da foto; são poucas usinas, então guardar as URLs evita rebaixar a imagem a cada troca.
const cacheImagens = new Map<string, string>();

/// Fundo da aplicação: a foto da usina selecionada no filtro global, em degradê e com transparência
/// (esmaece do canto superior para o inferior, sobre a cor de fundo do tema). Usinas sem foto ficam
/// só com a cor de fundo padrão.
export function FundoUsina() {
  const { usinaAtivaId: usinaSelecionada, visaoConsolidada } = useFiltros();
  const { pathname } = useLocation();
  // "Todas as usinas" no Painel Principal não tem uma foto própria: fica só a cor de fundo.
  const consolidadoNoPainel = visaoConsolidada && pathname === "/painel";
  const usinaAtivaId = consolidadoNoPainel ? null : usinaSelecionada;
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [versaoFoto, setVersaoFoto] = useState(0);

  useEffect(() => {
    const aoAlterar = () => setVersaoFoto((v) => v + 1);
    window.addEventListener(EVENTO_FOTO_USINA, aoAlterar);
    return () => window.removeEventListener(EVENTO_FOTO_USINA, aoAlterar);
  }, []);

  useEffect(() => {
    if (!usinaAtivaId) {
      setFotoUrl(null);
      return;
    }
    let cancelado = false;
    api
      .get<{ fotoUrl: string | null }>(`/usinas/${usinaAtivaId}`)
      .then(({ data }) => !cancelado && setFotoUrl(data.fotoUrl ?? null))
      .catch(() => !cancelado && setFotoUrl(null));
    return () => {
      cancelado = true;
    };
  }, [usinaAtivaId, versaoFoto]);

  useEffect(() => {
    if (!fotoUrl) {
      setImagem(null);
      return;
    }
    const emCache = cacheImagens.get(fotoUrl);
    if (emCache) {
      setImagem(emCache);
      return;
    }
    let cancelado = false;
    carregarImagemAutenticada(fotoUrl)
      .then((url) => {
        cacheImagens.set(fotoUrl, url);
        if (!cancelado) setImagem(url);
      })
      .catch(() => !cancelado && setImagem(null));
    return () => {
      cancelado = true;
    };
  }, [fotoUrl]);

  return (
    <div aria-hidden className="fundo-usina">
      {imagem && <div key={imagem} className="fundo-usina__imagem" style={{ backgroundImage: `url(${imagem})` }} />}
      <div className="fundo-usina__veu" />
    </div>
  );
}
