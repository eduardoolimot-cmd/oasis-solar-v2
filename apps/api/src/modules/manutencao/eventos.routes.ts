import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Eventos operacionais (paradas de geração/comunicação) — fonte de Disponibilidade/MTTR/MTBF da
// aba correspondente do Dashboard individual (ver lib/disponibilidade.ts e usinas/disponibilidade.routes.ts).

const router = Router();
router.use(autenticar);

router.get("/:usinaId/eventos", exigirPermissao("manutencao", "visualizar"), async (req, res) => {
  const inicio = req.query.inicio ? new Date(String(req.query.inicio)) : null;
  const fim = req.query.fim ? new Date(String(req.query.fim)) : null;

  const eventos = await prisma.eventoOperacional.findMany({
    where: {
      usinaId: req.params.usinaId,
      // Evento sobrepõe a janela quando começa antes do fim consultado e (ainda em andamento OU
      // termina depois do início consultado).
      ...(inicio && fim ? { inicio: { lte: fim }, OR: [{ fim: null }, { fim: { gte: inicio } }] } : {}),
    },
    include: { skid: { select: { id: true, nome: true } } },
    orderBy: { inicio: "desc" },
  });
  res.json(eventos);
});

const criarSchema = z.object({
  escopo: z.enum(["USINA", "EQUIPAMENTO"]),
  skidId: z.string().nullable().optional(),
  tipo: z.enum(["GERACAO", "COMUNICACAO"]).default("GERACAO"),
  inicio: z.coerce.date(),
  fim: z.coerce.date().nullable().optional(),
  motivo: z.string().optional(),
  ordemServicoId: z.string().nullable().optional(),
});

router.post("/:usinaId/eventos", exigirPermissao("manutencao", "criar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });
  if (parsed.data.escopo === "EQUIPAMENTO" && !parsed.data.skidId) {
    return res.status(400).json({ erro: "Informe o SKID quando o escopo é EQUIPAMENTO." });
  }
  if (parsed.data.fim && parsed.data.fim < parsed.data.inicio) {
    return res.status(400).json({ erro: "Data de fim anterior à data de início." });
  }

  const evento = await prisma.eventoOperacional.create({
    data: { ...parsed.data, usinaId: req.params.usinaId },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "EventoOperacional",
    entidadeId: evento.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(evento);
});

const editarSchema = criarSchema.partial();

router.put("/:usinaId/eventos/:eventoId", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.eventoOperacional.findFirst({ where: { id: req.params.eventoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Evento não encontrado." });

  const evento = await prisma.eventoOperacional.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "EventoOperacional",
    entidadeId: evento.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(evento);
});

// Encerrar rapidamente uma parada em andamento (atalho para PUT { fim: now }).
router.post("/:usinaId/eventos/:eventoId/encerrar", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const anterior = await prisma.eventoOperacional.findFirst({ where: { id: req.params.eventoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Evento não encontrado." });
  if (anterior.fim) return res.status(409).json({ erro: "Evento já está encerrado." });

  const evento = await prisma.eventoOperacional.update({ where: { id: anterior.id }, data: { fim: new Date() } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "EventoOperacional",
    entidadeId: evento.id,
    acao: "EDICAO",
    justificativa: "Evento encerrado.",
    valorNovo: { fim: evento.fim },
  });

  res.json(evento);
});

router.delete("/:usinaId/eventos/:eventoId", exigirPermissao("manutencao", "cancelar"), async (req, res) => {
  const evento = await prisma.eventoOperacional.findFirst({ where: { id: req.params.eventoId, usinaId: req.params.usinaId } });
  if (!evento) return res.status(404).json({ erro: "Evento não encontrado." });

  await prisma.eventoOperacional.delete({ where: { id: evento.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "EventoOperacional",
    entidadeId: evento.id,
    acao: "CANCELAMENTO",
    valorAnterior: evento,
  });

  res.status(204).end();
});

export default router;
