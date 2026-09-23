import { prisma } from "./prisma";

interface RegistrarAuditoriaInput {
  usuarioId: string | null;
  usinaId?: string | null;
  modulo: string;
  entidade: string;
  entidadeId?: string | null;
  acao: "CRIACAO" | "EDICAO" | "CANCELAMENTO" | "DESATIVACAO" | "MOVIMENTACAO" | "ACESSO";
  campo?: string | null;
  valorAnterior?: unknown;
  valorNovo?: unknown;
  justificativa?: string | null;
}

function paraTexto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "string") return valor;
  return JSON.stringify(valor);
}

/// Registro de auditoria: nunca editado/apagado pela interface. Para senhas, o chamador deve
/// passar valorAnterior/valorNovo como null e usar apenas a justificativa "Senha redefinida".
export async function registrarAuditoria(input: RegistrarAuditoriaInput) {
  await prisma.logAuditoria.create({
    data: {
      usuarioId: input.usuarioId,
      usinaId: input.usinaId ?? null,
      modulo: input.modulo,
      entidade: input.entidade,
      entidadeId: input.entidadeId ?? null,
      acao: input.acao,
      campo: input.campo ?? null,
      valorAnterior: paraTexto(input.valorAnterior),
      valorNovo: paraTexto(input.valorNovo),
      justificativa: input.justificativa ?? null,
    },
  });
}
