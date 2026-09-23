import { prisma } from "./prisma";

/// Os indicadores das abas do Dashboard são sempre calculados em tempo real a partir dos
/// lançamentos — não existe cache a invalidar. "Reprocessar" (idempotente: nunca coleta dados
/// novos nem duplica registros) apenas atualiza este carimbo de "último processamento" para a
/// aba, satisfazendo o requisito da especificação sem introduzir um cache que poderia ficar
/// desatualizado silenciosamente.
export async function registrarProcessamento(usinaId: string, aba: string, usuarioId: string) {
  return prisma.processamentoIndicador.upsert({
    where: { usinaId_aba: { usinaId, aba } },
    update: { processadoEm: new Date(), processadoPorId: usuarioId },
    create: { usinaId, aba, processadoPorId: usuarioId },
  });
}

export async function obterUltimoProcessamento(usinaId: string, aba: string) {
  const registro = await prisma.processamentoIndicador.findUnique({ where: { usinaId_aba: { usinaId, aba } } });
  if (!registro) return null;
  const usuario = registro.processadoPorId
    ? await prisma.usuario.findUnique({ where: { id: registro.processadoPorId }, select: { nome: true } })
    : null;
  return { data: registro.processadoEm, usuario: usuario?.nome ?? null };
}
