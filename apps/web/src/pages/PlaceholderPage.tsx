interface Props {
  titulo: string;
  fase: string;
}

export function PlaceholderPage({ titulo, fase }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-8">
      <h1 className="text-2xl font-semibold text-os-azul-marinho mb-2">{titulo}</h1>
      <p className="text-os-cinza text-sm">
        Módulo previsto para a <strong>{fase}</strong> do plano de desenvolvimento. Ainda não
        implementado nesta versão.
      </p>
    </div>
  );
}
