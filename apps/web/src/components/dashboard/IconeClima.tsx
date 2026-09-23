export type CategoriaClima = "SOL" | "NUBLADO" | "NEBLINA" | "CHUVA" | "TEMPESTADE";

/// Nome curto exibido ao lado do ícone (o detalhe — "Parcialmente nublado", "Garoa", temperaturas,
/// mm de chuva — continua no tooltip).
export const ROTULO_CATEGORIA_CLIMA: Record<CategoriaClima, string> = {
  SOL: "Sol",
  NUBLADO: "Nublado",
  NEBLINA: "Neblina",
  CHUVA: "Chuva",
  TEMPESTADE: "Tempestade",
};

interface Props {
  categoria: CategoriaClima;
  titulo: string;
  tamanho?: number;
}

// Ícones de tempo (sol/nuvem/chuva/tempestade) desenhados em SVG — evita depender de fonte com
// emoji (renderização inconsistente entre sistemas) e mantém o traço fino/flat da identidade
// OASIS SOLAR, usando as cores já estabelecidas na paleta.
export function IconeClima({ categoria, titulo, tamanho = 18 }: Props) {
  const props = { width: tamanho, height: tamanho, viewBox: "0 0 24 24", role: "img" as const, "aria-label": titulo };

  if (categoria === "SOL") {
    return (
      <svg {...props}>
        <title>{titulo}</title>
        <circle cx="12" cy="12" r="5" fill="#FBBB21" />
        <g stroke="#FBBB21" strokeWidth="1.8" strokeLinecap="round">
          <line x1="12" y1="1.5" x2="12" y2="4.5" />
          <line x1="12" y1="19.5" x2="12" y2="22.5" />
          <line x1="1.5" y1="12" x2="4.5" y2="12" />
          <line x1="19.5" y1="12" x2="22.5" y2="12" />
          <line x1="4.4" y1="4.4" x2="6.5" y2="6.5" />
          <line x1="17.5" y1="17.5" x2="19.6" y2="19.6" />
          <line x1="4.4" y1="19.6" x2="6.5" y2="17.5" />
          <line x1="17.5" y1="6.5" x2="19.6" y2="4.4" />
        </g>
      </svg>
    );
  }

  if (categoria === "CHUVA") {
    return (
      <svg {...props}>
        <title>{titulo}</title>
        <path d="M6.5 11.5a4.5 4.5 0 0 1 8.6-1.9A3.8 3.8 0 0 1 17.5 17H7a3.5 3.5 0 0 1-.5-6.97Z" fill="#878787" />
        <g stroke="#45A3DB" strokeWidth="1.6" strokeLinecap="round">
          <line x1="8.5" y1="18.5" x2="7.5" y2="21" />
          <line x1="12" y1="18.5" x2="11" y2="21" />
          <line x1="15.5" y1="18.5" x2="14.5" y2="21" />
        </g>
      </svg>
    );
  }

  if (categoria === "TEMPESTADE") {
    return (
      <svg {...props}>
        <title>{titulo}</title>
        <path d="M6.5 11.5a4.5 4.5 0 0 1 8.6-1.9A3.8 3.8 0 0 1 17.5 17H7a3.5 3.5 0 0 1-.5-6.97Z" fill="#878787" />
        <path d="M13 17.5 10.5 21.5H13L11 24" stroke="#B42318" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    );
  }

  if (categoria === "NEBLINA") {
    return (
      <svg {...props}>
        <title>{titulo}</title>
        <g stroke="#B7BDC3" strokeWidth="1.8" strokeLinecap="round">
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="13" x2="21" y2="13" />
          <line x1="3" y1="17" x2="17" y2="17" />
        </g>
      </svg>
    );
  }

  // NUBLADO
  return (
    <svg {...props}>
      <title>{titulo}</title>
      <path d="M6.5 17.5a4.5 4.5 0 0 1 .9-8.9A5 5 0 0 1 17 10.1 3.9 3.9 0 0 1 16.5 17.5Z" fill="#B7BDC3" />
    </svg>
  );
}
