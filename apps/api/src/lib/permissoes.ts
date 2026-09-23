// Catálogo de módulos e ações — espelhado no frontend (apps/web/src/theme/permissoes.ts).
// Fonte: PDF de especificação, seção "Usuários, acesso e segurança" (matriz de ações).

export const MODULOS = [
  "painel",
  "cadastro_usinas",
  "lancamentos",
  "manutencao",
  "estoque",
  "financeiro",
  "comparativo",
  "ranking",
  "relatorios",
  "notificacoes",
  "usuarios",
] as const;

export type Modulo = (typeof MODULOS)[number];

export const ACOES = [
  "visualizar",
  "criar",
  "editar",
  "desativar",
  "cancelar",
  "exportar",
  "movimentar",
  "ajustar",
  "liquidar",
  "reprocessar",
  "administrar",
] as const;

export type Acao = (typeof ACOES)[number];

/// Verifica se as linhas de permissão do usuário cobrem (usinaId, modulo, acao).
/// Regra: ADMIN tem acesso irrestrito. Usuário comum precisa de uma linha compatível:
/// - linha com usinaId igual à consultada, ou
/// - linha com usinaId nulo (todas as usinas autorizadas no momento da concessão),
///   cobrindo também usinas futuras somente quando incluirFuturas = true.
export function permissaoCobre(
  permissoes: { usinaId: string | null; incluirFuturas: boolean; modulo: string; acao: string }[],
  usinaId: string | null,
  modulo: Modulo,
  acao: Acao,
  usinaFoiCriadaAposConcessaoMaisAntiga: boolean = false
): boolean {
  return permissoes.some((p) => {
    if (p.modulo !== modulo || p.acao !== acao) return false;
    if (p.usinaId === usinaId) return true;
    if (p.usinaId === null) {
      if (usinaFoiCriadaAposConcessaoMaisAntiga) return p.incluirFuturas;
      return true;
    }
    return false;
  });
}
