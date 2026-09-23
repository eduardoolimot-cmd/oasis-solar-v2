import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { calcularResumoFinanceiro } from "../../lib/financeiro";
import { resolverPeriodo } from "../../lib/periodo";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Financeiro — custo de O&M por usina. Duas origens somadas, nunca duplicadas:
//   1) Peças consumidas do estoque (MovimentacaoEstoque tipo SAIDA), custo já reconhecido no
//      consumo (não na compra) — ver docs/DECISOES_PLACEHOLDER.md.
//   2) Lançamentos manuais (mão de obra, serviço terceirizado, peças avulsas fora do estoque
//      controlado, outros).
// "Custo por kWp" usa sempre a potência DC instalada (kWp é, por definição, potência de pico DC),
// nunca a potência CA — diferente da convenção AC/DC configurável do Fator de Capacidade.

const router = Router();
router.use(autenticar);

const CATEGORIAS = ["MAO_DE_OBRA", "SERVICO_TERCEIRIZADO", "PECAS_AVULSAS", "OUTROS"] as const;

router.get("/:usinaId/financeiro/resumo", exigirPermissao("financeiro", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio, fim } = resolverPeriodo(req.query);
  const resumo = await calcularResumoFinanceiro(usina.id, usina.potenciaDcKwp, inicio, fim);

  res.json({
    usina: { id: usina.id, nome: usina.nome, potenciaDcKwp: usina.potenciaDcKwp },
    periodo: { inicio, fim },
    kpis: { custoTotal: resumo.custoTotal, custoPorKwp: resumo.custoPorKwp, consumoSemCustoApurado: resumo.consumoSemCustoApurado },
    custoPorCategoria: resumo.custoPorCategoria,
    serieMensal: resumo.serieMensal,
  });
});

router.get("/:usinaId/financeiro/lancamentos", exigirPermissao("financeiro", "visualizar"), async (req, res) => {
  const { inicio, fim } = resolverPeriodo(req.query);
  const lancamentos = await prisma.lancamentoFinanceiro.findMany({
    where: { usinaId: req.params.usinaId, data: { gte: inicio, lte: fim } },
    include: { ordemServico: { select: { id: true, titulo: true } } },
    orderBy: { data: "desc" },
  });
  res.json(lancamentos);
});

const criarSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  descricao: z.string().min(1),
  valor: z.number().positive(),
  data: z.coerce.date(),
  ordemServicoId: z.string().nullable().optional(),
});

router.post("/:usinaId/financeiro/lancamentos", exigirPermissao("financeiro", "criar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const lancamento = await prisma.lancamentoFinanceiro.create({
    data: { ...parsed.data, usinaId: req.params.usinaId, criadoPorId: req.usuario!.id },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "financeiro",
    entidade: "LancamentoFinanceiro",
    entidadeId: lancamento.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(lancamento);
});

const editarSchema = criarSchema.partial();

router.put("/:usinaId/financeiro/lancamentos/:lancamentoId", exigirPermissao("financeiro", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.lancamentoFinanceiro.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Lançamento não encontrado." });

  const lancamento = await prisma.lancamentoFinanceiro.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "financeiro",
    entidade: "LancamentoFinanceiro",
    entidadeId: lancamento.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(lancamento);
});

router.delete("/:usinaId/financeiro/lancamentos/:lancamentoId", exigirPermissao("financeiro", "cancelar"), async (req, res) => {
  const lancamento = await prisma.lancamentoFinanceiro.findFirst({ where: { id: req.params.lancamentoId, usinaId: req.params.usinaId } });
  if (!lancamento) return res.status(404).json({ erro: "Lançamento não encontrado." });

  await prisma.lancamentoFinanceiro.delete({ where: { id: lancamento.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "financeiro",
    entidade: "LancamentoFinanceiro",
    entidadeId: lancamento.id,
    acao: "CANCELAMENTO",
    valorAnterior: lancamento,
  });

  res.status(204).end();
});

export default router;
