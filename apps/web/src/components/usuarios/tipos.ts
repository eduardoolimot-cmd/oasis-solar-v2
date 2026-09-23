export interface PermissaoLinha {
  usinaId: string | null;
  incluirFuturas: boolean;
  modulo: string;
  acao: string;
  usina?: { id: string; nome: string } | null;
}
