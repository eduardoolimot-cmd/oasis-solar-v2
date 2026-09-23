import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Planos de manutenção preventiva — recorrência simples por intervalo de dias. "Gerar OS" cria uma
// Ordem de Serviço do tipo PREVENTIVA vinculada ao plano e avança proximaGeracao (nunca
// retroativamente: atraso não acumula OS perdidas, ver schema.prisma).

const router = Router();
router.use(autenticar);

router.get("/:usinaId/preventivas", exigirPermissao("manutencao", "visualizar"), async (req, res) => {
  const planos = await prisma.planoPreventivo.findMany({
    where: { usinaId: req.params.usinaId },
    include: { skid: { select: { id: true, nome: true } } },
    orderBy: { proximaGeracao: "asc" },
  });
  res.json(planos);
});

const criarSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string().optional(),
  frequenciaDias: z.number().int().positive(),
  skidId: z.string().nullable().optional(),
  proximaGeracao: z.coerce.date(),
});

router.post("/:usinaId/preventivas", exigirPermissao("manutencao", "criar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const plano = await prisma.planoPreventivo.create({ data: { ...parsed.data, usinaId: req.params.usinaId } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "PlanoPreventivo",
    entidadeId: plano.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(plano);
});

const editarSchema = criarSchema.partial().extend({ ativo: z.boolean().optional() });

router.put("/:usinaId/preventivas/:planoId", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.planoPreventivo.findFirst({ where: { id: req.params.planoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Plano não encontrado." });

  const plano = await prisma.planoPreventivo.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "PlanoPreventivo",
    entidadeId: plano.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(plano);
});

// Gera uma nova Ordem de Serviço PREVENTIVA a partir do plano e avança "proximaGeracao" por
// exatamente uma frequência (nunca a partir de hoje, para não perder o compasso da recorrência).
router.post("/:usinaId/preventivas/:planoId/gerar-os", exigirPermissao("manutencao", "criar"), async (req, res) => {
  const plano = await prisma.planoPreventivo.findFirst({ where: { id: req.params.planoId, usinaId: req.params.usinaId } });
  if (!plano) return res.status(404).json({ erro: "Plano não encontrado." });
  if (!plano.ativo) return res.status(409).json({ erro: "Plano desativado — reative antes de gerar uma OS." });

  const proximaGeracaoNova = new Date(plano.proximaGeracao.getTime() + plano.frequenciaDias * 86_400_000);

  const [os] = await prisma.$transaction([
    prisma.ordemServico.create({
      data: {
        usinaId: req.params.usinaId,
        titulo: plano.titulo,
        descricao: plano.descricao,
        tipo: "PREVENTIVA",
        skidId: plano.skidId,
        dataPrevista: plano.proximaGeracao,
        planoPreventivoId: plano.id,
        criadoPorId: req.usuario!.id,
      },
    }),
    prisma.planoPreventivo.update({ where: { id: plano.id }, data: { proximaGeracao: proximaGeracaoNova } }),
  ]);

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: os.id,
    acao: "CRIACAO",
    justificativa: `Gerada a partir do plano preventivo "${plano.titulo}"`,
  });

  res.status(201).json({ os, proximaGeracao: proximaGeracaoNova });
});

export default router;
