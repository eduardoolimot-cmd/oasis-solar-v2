import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { autenticar, exigirAdmin } from "../../middleware/auth";
import { usinasAutorizadas } from "../../middleware/permissao";

const router = Router();
router.use(autenticar, exigirAdmin); // Notificações e Histórico: restrito ao administrador

// Histórico/auditoria: somente leitura, sem edição ou exclusão pela interface (nem para
// administradores). Eventos administrativos (módulo "usuarios") só aparecem para o administrador.
router.get("/", async (req, res) => {
  const usuario = req.usuario!;
  const permitidas = await usinasAutorizadas(usuario, "notificacoes", "visualizar");

  const where: Record<string, unknown> = {};
  if (permitidas) where.usinaId = { in: permitidas };

  // Eventos administrativos (módulo "usuarios") só para ADMIN — nunca contornável passando
  // ?modulo=usuarios na query (bug real corrigido: antes, o filtro explícito da query sobrescrevia
  // por completo esta restrição, em vez de se combinar com ela).
  const moduloQuery = typeof req.query.modulo === "string" ? req.query.modulo : undefined;
  if (usuario.perfil !== "ADMIN") {
    where.modulo = moduloQuery === "usuarios" ? "__nenhum__" : moduloQuery ?? { not: "usuarios" };
  } else if (moduloQuery) {
    where.modulo = moduloQuery;
  }

  if (req.query.usinaId) where.usinaId = req.query.usinaId;
  if (req.query.usuarioId) where.usuarioId = req.query.usuarioId;
  if (req.query.acao) where.acao = req.query.acao;
  if (req.query.inicio || req.query.fim) {
    const criadoEm: Record<string, Date> = {};
    if (req.query.inicio) criadoEm.gte = new Date(String(req.query.inicio));
    // "fim" é uma data pura (sem hora) — inclui o dia inteiro somando 24h, mesma convenção usada
    // em usinas/disponibilidade.routes.ts e lib/financeiro.ts para não descontar o último dia.
    if (req.query.fim) criadoEm.lt = new Date(new Date(String(req.query.fim)).getTime() + 86_400_000);
    where.criadoEm = criadoEm;
  }

  const limiteQuery = Number(req.query.limite);
  const take = Number.isInteger(limiteQuery) && limiteQuery > 0 ? Math.min(limiteQuery, 500) : 100;
  const cursor = typeof req.query.antesDe === "string" ? req.query.antesDe : undefined;

  const logs = await prisma.logAuditoria.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { usuario: { select: { nome: true } } },
  });

  res.json(logs);
});

export default router;
