import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

router.get("/:usinaId/inversores", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const inversores = await prisma.inversor.findMany({
    where: { usinaId: req.params.usinaId, ativo: true },
    include: { skid: { select: { id: true, nome: true } } },
    orderBy: { identificacao: "asc" },
  });
  res.json(inversores);
});

const criarSchema = z.object({
  identificacao: z.string().min(1),
  quantidadeModulos: z.number().int().nonnegative().optional(),
  kwCa: z.number().positive().optional(),
  modelo: z.string().optional(),
  marca: z.string().optional(),
  moduloWp: z.number().positive().optional(),
  skidId: z.string().nullable().optional(),
});

router.post("/:usinaId/inversores", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  // A identificação (ex.: "INV1") é única por SKID, não pela usina inteira — o mesmo rótulo se
  // repete em SKIDs diferentes.
  const existente = await prisma.inversor.findFirst({
    where: { usinaId: req.params.usinaId, skidId: parsed.data.skidId ?? null, identificacao: parsed.data.identificacao },
  });
  if (existente) return res.status(409).json({ erro: "Já existe um inversor com esta identificação neste SKID." });

  if (parsed.data.skidId) {
    const skid = await prisma.skid.findFirst({ where: { id: parsed.data.skidId, usinaId: req.params.usinaId } });
    if (!skid) return res.status(400).json({ erro: "SKID inválido para esta usina." });
  }

  const inversor = await prisma.inversor.create({ data: { ...parsed.data, usinaId: req.params.usinaId } });
  if (inversor.skidId) {
    await prisma.vinculoInversorSkid.create({ data: { inversorId: inversor.id, skidId: inversor.skidId } });
  }

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Inversor",
    entidadeId: inversor.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(inversor);
});

const editarSchema = criarSchema.omit({ skidId: true }).partial();

router.put("/:usinaId/inversores/:inversorId", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.inversor.findFirst({
    where: { id: req.params.inversorId, usinaId: req.params.usinaId },
  });
  if (!anterior) return res.status(404).json({ erro: "Inversor não encontrado." });

  const inversor = await prisma.inversor.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Inversor",
    entidadeId: inversor.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(inversor);
});

const vincularSchema = z.object({ skidId: z.string().nullable() });

// Vincular/desvincular é uma rota própria (não parte do PUT genérico) porque precisa fechar a
// vigência anterior e abrir uma nova em VinculoInversorSkid — histórico usado por relatórios e
// pelos totais diários por SKID (Fase 3/4).
router.post(
  "/:usinaId/inversores/:inversorId/vincular",
  exigirPermissao("cadastro_usinas", "editar"),
  async (req, res) => {
    const parsed = vincularSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

    const inversor = await prisma.inversor.findFirst({
      where: { id: req.params.inversorId, usinaId: req.params.usinaId },
    });
    if (!inversor) return res.status(404).json({ erro: "Inversor não encontrado." });

    if (parsed.data.skidId) {
      const skid = await prisma.skid.findFirst({ where: { id: parsed.data.skidId, usinaId: req.params.usinaId } });
      if (!skid) return res.status(400).json({ erro: "SKID inválido para esta usina." });
    }

    const skidAnteriorId = inversor.skidId;
    const agora = new Date();

    await prisma.$transaction([
      prisma.vinculoInversorSkid.updateMany({
        where: { inversorId: inversor.id, fimVigencia: null },
        data: { fimVigencia: agora },
      }),
      prisma.vinculoInversorSkid.create({
        data: { inversorId: inversor.id, skidId: parsed.data.skidId, inicioVigencia: agora },
      }),
      prisma.inversor.update({ where: { id: inversor.id }, data: { skidId: parsed.data.skidId } }),
    ]);

    await registrarAuditoria({
      usuarioId: req.usuario!.id,
      usinaId: req.params.usinaId,
      modulo: "cadastro_usinas",
      entidade: "Inversor",
      entidadeId: inversor.id,
      acao: "MOVIMENTACAO",
      campo: "skidId",
      valorAnterior: skidAnteriorId,
      valorNovo: parsed.data.skidId,
    });

    res.status(204).end();
  }
);

router.post(
  "/:usinaId/inversores/:inversorId/desativar",
  exigirPermissao("cadastro_usinas", "desativar"),
  async (req, res) => {
    const inversor = await prisma.inversor.findFirst({
      where: { id: req.params.inversorId, usinaId: req.params.usinaId },
    });
    if (!inversor) return res.status(404).json({ erro: "Inversor não encontrado." });

    await prisma.inversor.update({ where: { id: inversor.id }, data: { ativo: false } });

    await registrarAuditoria({
      usuarioId: req.usuario!.id,
      usinaId: req.params.usinaId,
      modulo: "cadastro_usinas",
      entidade: "Inversor",
      entidadeId: inversor.id,
      acao: "DESATIVACAO",
    });

    res.status(204).end();
  }
);

export default router;
