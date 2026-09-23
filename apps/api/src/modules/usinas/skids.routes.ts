import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

router.get("/:usinaId/skids", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const skids = await prisma.skid.findMany({
    where: { usinaId: req.params.usinaId },
    include: { inversores: { where: { ativo: true }, select: { id: true, identificacao: true, kwCa: true } } },
    orderBy: { nome: "asc" },
  });
  const totalInversores = await prisma.inversor.count({ where: { usinaId: req.params.usinaId, ativo: true } });
  const naoAtribuidos = await prisma.inversor.findMany({
    where: { usinaId: req.params.usinaId, ativo: true, skidId: null },
    select: { id: true, identificacao: true },
  });
  res.json({ skids, totalInversores, naoAtribuidos });
});

const criarSchema = z.object({
  nome: z.string().min(1),
  uc: z.string().optional(),
  potenciaFvKwp: z.number().positive().optional(),
  transformadorKva: z.number().positive().optional(),
  fabricante: z.string().optional(),
  modelo: z.string().optional(),
  inicioOperacao: z.coerce.date().optional(),
  observacoes: z.string().optional(),
});

router.post("/:usinaId/skids", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const existente = await prisma.skid.findFirst({ where: { usinaId: req.params.usinaId, nome: parsed.data.nome } });
  if (existente) return res.status(409).json({ erro: "Já existe um SKID com este nome nesta usina." });

  const skid = await prisma.skid.create({ data: { ...parsed.data, usinaId: req.params.usinaId } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Skid",
    entidadeId: skid.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(skid);
});

router.put("/:usinaId/skids/:skidId", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = criarSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.skid.findFirst({ where: { id: req.params.skidId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "SKID não encontrado." });

  const skid = await prisma.skid.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Skid",
    entidadeId: skid.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(skid);
});

// Ícone de lixeira: SKID sem histórico (nunca teve inversor vinculado) pode ser excluído; com
// histórico, apenas desativado. O destino dos inversores atualmente vinculados deve ser resolvido
// antes (desvincular via rota de inversores) — a exclusão/desativação não força isso automaticamente.
router.delete("/:usinaId/skids/:skidId", exigirPermissao("cadastro_usinas", "desativar"), async (req, res) => {
  const skid = await prisma.skid.findFirst({ where: { id: req.params.skidId, usinaId: req.params.usinaId } });
  if (!skid) return res.status(404).json({ erro: "SKID não encontrado." });

  const inversoresVinculadosAgora = await prisma.inversor.count({ where: { skidId: skid.id } });
  if (inversoresVinculadosAgora > 0) {
    return res.status(409).json({ erro: "Desvincule os inversores atribuídos antes de excluir ou desativar o SKID." });
  }

  const teveHistorico = await prisma.vinculoInversorSkid.count({ where: { skidId: skid.id } });

  if (teveHistorico === 0) {
    await prisma.skid.delete({ where: { id: skid.id } });
    await registrarAuditoria({
      usuarioId: req.usuario!.id,
      usinaId: req.params.usinaId,
      modulo: "cadastro_usinas",
      entidade: "Skid",
      entidadeId: skid.id,
      acao: "CANCELAMENTO",
      justificativa: "Excluído sem histórico de vínculo.",
    });
    return res.status(204).end();
  }

  await prisma.skid.update({ where: { id: skid.id }, data: { ativo: false } });
  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Skid",
    entidadeId: skid.id,
    acao: "DESATIVACAO",
    justificativa: "SKID possui histórico de vínculo — desativado em vez de excluído.",
  });
  res.status(204).end();
});

export default router;
