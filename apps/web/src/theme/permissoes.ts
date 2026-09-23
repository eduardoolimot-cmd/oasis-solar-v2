// Espelha apps/api/src/lib/permissoes.ts — manter em sincronia.

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
] as const; // "usuarios" fica de fora: administração é exclusiva do perfil ADMIN, não concedida por permissão.

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
] as const;
