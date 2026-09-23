import { ReactNode, useState } from "react";

interface Props {
  titulo: string;
  subtitulo?: string;
  defaultAberta?: boolean;
  pendente?: boolean;
  children: ReactNode;
}

/// Seção recolhível do cadastro "Configurações da usina" (Identificação, Dados nominais,
/// Degradação esperada, SKIDs/Inversores, Metas mensais). Cada seção sinaliza alterações
/// pendentes e é salva independentemente, conforme a especificação.
export function SecaoExpansivel({ titulo, subtitulo, defaultAberta = false, pendente, children }: Props) {
  const [aberta, setAberta] = useState(defaultAberta);

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50"
      >
        <div>
          <h2 className="text-os-azul-marinho font-semibold flex items-center gap-2">
            {titulo}
            {pendente && (
              <span className="inline-block w-2 h-2 rounded-full bg-os-laranja" title="Alterações não salvas" />
            )}
          </h2>
          {subtitulo && <p className="text-os-cinza text-xs mt-0.5">{subtitulo}</p>}
        </div>
        <span className="text-os-azul-marinho text-lg">{aberta ? "−" : "+"}</span>
      </button>
      {aberta && <div className="px-5 pb-5 border-t border-slate-100 pt-4">{children}</div>}
    </div>
  );
}
