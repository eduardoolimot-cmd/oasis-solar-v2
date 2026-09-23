import { Info } from "lucide-react";
import { useState } from "react";

interface Props {
  /// Nome do indicador (usado só no rótulo acessível do botão).
  titulo: string;
  texto: string;
  /// "direita": o balão abre para a esquerda do ícone, ancorado na borda direita (ícone no canto do
  /// card). "centro": balão centralizado no ícone (cards com título centralizado).
  alinhamento?: "direita" | "centro";
}

/// Ícone "i" que explica um indicador: abre ao passar o mouse, focar com o teclado ou tocar/clicar;
/// fecha ao sair, desfocar ou teclar Esc.
export function InfoTooltip({ titulo, texto, alinhamento = "direita" }: Props) {
  const [aberto, setAberto] = useState(false);
  const posicao = alinhamento === "centro" ? "left-1/2 -translate-x-1/2" : "right-0";

  return (
    <span className="relative shrink-0 inline-flex" onMouseEnter={() => setAberto(true)} onMouseLeave={() => setAberto(false)}>
      <button
        type="button"
        aria-label={`Informação sobre ${titulo}`}
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
        className="text-os-cinza hover:text-os-azul-marinho focus:outline-none focus:ring-2 focus:ring-os-azul-claro rounded-full"
      >
        <Info size={15} />
      </button>
      {aberto && (
        <span role="tooltip" className={`absolute ${posicao} top-full mt-1.5 z-30 w-64 max-w-[80vw] rounded-lg bg-os-azul-marinho text-white text-xs leading-snug p-3 shadow-lg font-normal text-left`}>
          {texto}
        </span>
      )}
    </span>
  );
}
