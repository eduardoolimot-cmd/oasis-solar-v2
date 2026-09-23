import { useEffect, useState } from "react";
import { carregarImagemAutenticada } from "../api/client";

interface Props {
  caminho: string | null; // ex.: "/uploads/arquivo.jpg" (rota servida via /api/uploads/:arquivo)
  alt: string;
  className?: string;
}

export function FotoAutenticada({ caminho, alt, className }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!caminho) {
      setObjectUrl(null);
      return;
    }
    let cancelado = false;
    let urlAtual: string | null = null;
    // O cliente axios já prefixa "/api": "/uploads/x.jpg" vira "/api/uploads/x.jpg".
    carregarImagemAutenticada(caminho).then((url) => {
      if (cancelado) {
        URL.revokeObjectURL(url);
        return;
      }
      urlAtual = url;
      setObjectUrl(url);
    });
    return () => {
      cancelado = true;
      if (urlAtual) URL.revokeObjectURL(urlAtual);
    };
  }, [caminho]);

  if (!caminho) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 text-os-cinza text-xs ${className ?? ""}`}>
        Sem foto
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={`flex items-center justify-center bg-slate-100 text-os-cinza text-xs ${className ?? ""}`}>Carregando...</div>;
  }

  return <img src={objectUrl} alt={alt} className={className} />;
}
