import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

function inicioDoDia(data: string): Date {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---- Geração diária ----

router.get("/:usinaId/lancamentos/geracao", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const dataInicio = req.query.inicio ? inicioDoDia(String(req.query.inicio)) : undefined;
  const dataFim = req.query.fim ? inicioDoDia(String(req.query.fim)) : undefined;
  const skidId = typeof req.query.skidId === "string" && req.query.skidId ? req.query.skidId : undefined;
  const inversorId = typeof req.query.inversorId === "string" && req.query.inversorId ? req.query.inversorId : undefined;

  const lancamentos = await prisma.lancamentoGeracaoDiaria.findMany({
    where: {
      usinaId: req.params.usinaId,
      data: dataInicio || dataFim ? { gte: dataInicio, lte: dataFim } : undefined,
      skidId,
      inversorId,
    },
    include: { skid: { select: { id: true, nome: true } }, inversor: { select: { id: true, identificacao: true } } },
    orderBy: [{ data: "desc" }],
    take: 500,
  });
  res.json(lancamentos);
});

const editarGeracaoSchema = z.object({
  energiaKwh: z.number().nonnegative(),
  observacao: z.string().optional(),
});

// Edição preserva o valor anterior na trilha de auditoria (valorAnterior/valorNovo).
router.put("/:usinaId/lancamentos/geracao/:lancamentoId", exigirPermissao("lancamentos", "editar"), async (req, res) => {
  const parsed = editarGeracaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.lancamentoGeracaoDiaria.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Lançamento não encontrado." });

  const registro = await prisma.lancamentoGeracaoDiaria.update({
    where: { id: anterior.id },
    data: { energiaKwh: parsed.data.energiaKwh, observacao: parsed.data.observacao ?? anterior.observacao, criadoPorId: req.usuario!.id },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoGeracaoDiaria",
    entidadeId: registro.id,
    acao: "EDICAO",
    valorAnterior: anterior.energiaKwh,
    valorNovo: registro.energiaKwh,
  });

  res.json(registro);
});

router.delete("/:usinaId/lancamentos/geracao/:lancamentoId", exigirPermissao("lancamentos", "cancelar"), async (req, res) => {
  const anterior = await prisma.lancamentoGeracaoDiaria.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Lançamento não encontrado." });

  await prisma.lancamentoGeracaoDiaria.delete({ where: { id: anterior.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoGeracaoDiaria",
    entidadeId: anterior.id,
    acao: "CANCELAMENTO",
    valorAnterior: { data: anterior.data, energiaKwh: anterior.energiaKwh, skidId: anterior.skidId, inversorId: anterior.inversorId },
    valorNovo: null,
  });

  res.status(204).end();
});

const lancamentoGeracaoSchema = z.object({
  skidId: z.string().nullable().optional(),
  inversorId: z.string().nullable().optional(),
  data: z.string(), // YYYY-MM-DD
  energiaKwh: z.number(),
  origem: z.string().optional(),
  observacao: z.string().optional(),
});

// Duplicidade controlada na aplicação (usina + SKID + inversor + data). Registro existente é
// atualizado preservando o valor anterior no histórico — nunca duplicado silenciosamente.
router.post("/:usinaId/lancamentos/geracao", exigirPermissao("lancamentos", "criar"), async (req, res) => {
  const parsed = lancamentoGeracaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const data = inicioDoDia(parsed.data.data);
  const skidId = parsed.data.skidId ?? null;
  const inversorId = parsed.data.inversorId ?? null;

  const existente = await prisma.lancamentoGeracaoDiaria.findFirst({
    where: { usinaId: req.params.usinaId, skidId, inversorId, data },
  });

  const registro = existente
    ? await prisma.lancamentoGeracaoDiaria.update({
        where: { id: existente.id },
        data: {
          energiaKwh: parsed.data.energiaKwh,
          origem: parsed.data.origem,
          observacao: parsed.data.observacao,
          criadoPorId: req.usuario!.id,
        },
      })
    : await prisma.lancamentoGeracaoDiaria.create({
        data: {
          usinaId: req.params.usinaId,
          skidId,
          inversorId,
          data,
          energiaKwh: parsed.data.energiaKwh,
          origem: parsed.data.origem,
          observacao: parsed.data.observacao,
          criadoPorId: req.usuario!.id,
        },
      });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoGeracaoDiaria",
    entidadeId: registro.id,
    acao: existente ? "EDICAO" : "CRIACAO",
    valorAnterior: existente?.energiaKwh ?? null,
    valorNovo: registro.energiaKwh,
  });

  res.status(existente ? 200 : 201).json(registro);
});

// ---- Irradiação diária ----

router.get("/:usinaId/lancamentos/irradiacao", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const dataInicio = req.query.inicio ? inicioDoDia(String(req.query.inicio)) : undefined;
  const dataFim = req.query.fim ? inicioDoDia(String(req.query.fim)) : undefined;
  const skidId = typeof req.query.skidId === "string" && req.query.skidId ? req.query.skidId : undefined;

  const lancamentos = await prisma.lancamentoIrradiacaoDiaria.findMany({
    where: {
      usinaId: req.params.usinaId,
      data: dataInicio || dataFim ? { gte: dataInicio, lte: dataFim } : undefined,
      skidId,
    },
    include: { skid: { select: { id: true, nome: true } } },
    orderBy: [{ data: "desc" }],
    take: 500,
  });
  res.json(lancamentos);
});

router.put("/:usinaId/lancamentos/irradiacao/:lancamentoId", exigirPermissao("lancamentos", "editar"), async (req, res) => {
  const parsed = z.object({ irradiacaoKwhM2: z.number().nonnegative() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.lancamentoIrradiacaoDiaria.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Lançamento não encontrado." });

  const registro = await prisma.lancamentoIrradiacaoDiaria.update({
    where: { id: anterior.id },
    data: { irradiacaoKwhM2: parsed.data.irradiacaoKwhM2, criadoPorId: req.usuario!.id },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoIrradiacaoDiaria",
    entidadeId: registro.id,
    acao: "EDICAO",
    valorAnterior: anterior.irradiacaoKwhM2,
    valorNovo: registro.irradiacaoKwhM2,
  });

  res.json(registro);
});

router.delete("/:usinaId/lancamentos/irradiacao/:lancamentoId", exigirPermissao("lancamentos", "cancelar"), async (req, res) => {
  const anterior = await prisma.lancamentoIrradiacaoDiaria.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Lançamento não encontrado." });

  await prisma.lancamentoIrradiacaoDiaria.delete({ where: { id: anterior.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoIrradiacaoDiaria",
    entidadeId: anterior.id,
    acao: "CANCELAMENTO",
    valorAnterior: { data: anterior.data, irradiacaoKwhM2: anterior.irradiacaoKwhM2, skidId: anterior.skidId },
    valorNovo: null,
  });

  res.status(204).end();
});

const lancamentoIrradiacaoSchema = z.object({
  skidId: z.string().nullable().optional(),
  data: z.string(),
  irradiacaoKwhM2: z.number(),
  plano: z.enum(["GHI", "POA"]).optional(),
  origem: z.string().optional(),
});

router.post("/:usinaId/lancamentos/irradiacao", exigirPermissao("lancamentos", "criar"), async (req, res) => {
  const parsed = lancamentoIrradiacaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const data = inicioDoDia(parsed.data.data);
  const skidId = parsed.data.skidId ?? null;

  const existente = await prisma.lancamentoIrradiacaoDiaria.findFirst({
    where: { usinaId: req.params.usinaId, skidId, data },
  });

  const registro = existente
    ? await prisma.lancamentoIrradiacaoDiaria.update({
        where: { id: existente.id },
        data: { irradiacaoKwhM2: parsed.data.irradiacaoKwhM2, plano: parsed.data.plano, origem: parsed.data.origem, criadoPorId: req.usuario!.id },
      })
    : await prisma.lancamentoIrradiacaoDiaria.create({
        data: {
          usinaId: req.params.usinaId,
          skidId,
          data,
          irradiacaoKwhM2: parsed.data.irradiacaoKwhM2,
          plano: parsed.data.plano,
          origem: parsed.data.origem,
          criadoPorId: req.usuario!.id,
        },
      });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "LancamentoIrradiacaoDiaria",
    entidadeId: registro.id,
    acao: existente ? "EDICAO" : "CRIACAO",
    valorAnterior: existente?.irradiacaoKwhM2 ?? null,
    valorNovo: registro.irradiacaoKwhM2,
  });

  res.status(existente ? 200 : 201).json(registro);
});

// ---- Fechamento de competência ----

router.get("/:usinaId/fechamento", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const ano = Number(req.query.ano) || new Date().getFullYear();
  const fechamentos = await prisma.fechamentoCompetencia.findMany({ where: { usinaId: req.params.usinaId, ano } });
  res.json(fechamentos);
});

const fechamentoSchema = z.object({ ano: z.number().int(), mes: z.number().int().min(1).max(12), situacao: z.enum(["PARCIAL", "FECHADO"]) });

// Fechar/reabrir é sempre uma ação explícita do usuário — nunca automático.
router.put("/:usinaId/fechamento", exigirPermissao("lancamentos", "criar"), async (req, res) => {
  const parsed = fechamentoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const registro = await prisma.fechamentoCompetencia.upsert({
    where: { usinaId_ano_mes: { usinaId: req.params.usinaId, ano: parsed.data.ano, mes: parsed.data.mes } },
    update: { situacao: parsed.data.situacao, atualizadoPorId: req.usuario!.id },
    create: { usinaId: req.params.usinaId, ano: parsed.data.ano, mes: parsed.data.mes, situacao: parsed.data.situacao, atualizadoPorId: req.usuario!.id },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "lancamentos",
    entidade: "FechamentoCompetencia",
    entidadeId: registro.id,
    acao: "EDICAO",
    valorNovo: `${parsed.data.ano}-${parsed.data.mes}: ${parsed.data.situacao}`,
  });

  res.json(registro);
});

export default router;
