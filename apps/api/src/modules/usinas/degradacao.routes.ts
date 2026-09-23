import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { calcularRetencaoDegradacao, cenarioDegradacaoInvalido } from "../../lib/calculos";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

router.get("/:usinaId/degradacao", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const atual = await prisma.degradacao.findFirst({
    where: { usinaId: req.params.usinaId, ativo: true },
  });
  if (!atual) return res.json({ atual: null, previa: null });

  const previa = calcularRetencaoDegradacao(atual.perdaPrimeiroAnoPct, atual.perdaAnualConstantePct, 30);
  res.json({ atual, previa });
});

const salvarSchema = z.object({
  perdaPrimeiroAnoPct: z.number().min(0),
  perdaAnualConstantePct: z.number().min(0),
  dataBase: z.coerce.date(),
  documentoOrigem: z.string().optional(),
});

// Salvar cria sempre uma nova versão (nunca sobrescreve) — "Preservar versões" e "não alterar
// automaticamente previsões já salvas" (especificação, Cadastro · Degradação esperada).
router.post("/:usinaId/degradacao", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const parsed = salvarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  if (cenarioDegradacaoInvalido(parsed.data.perdaPrimeiroAnoPct, parsed.data.perdaAnualConstantePct, 30)) {
    return res
      .status(400)
      .json({ erro: "Cenário produz retenção negativa dentro de 30 anos. Ajuste as perdas informadas." });
  }

  const anterior = await prisma.degradacao.findFirst({
    where: { usinaId: req.params.usinaId, ativo: true },
    orderBy: { versao: "desc" },
  });
  const novaVersao = (anterior?.versao ?? 0) + 1;

  const [, criado] = await prisma.$transaction([
    prisma.degradacao.updateMany({ where: { usinaId: req.params.usinaId, ativo: true }, data: { ativo: false } }),
    prisma.degradacao.create({
      data: { ...parsed.data, usinaId: req.params.usinaId, versao: novaVersao },
    }),
  ]);

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "Degradacao",
    entidadeId: criado.id,
    acao: "CRIACAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
    justificativa: `Nova versão ${novaVersao}`,
  });

  const previa = calcularRetencaoDegradacao(criado.perdaPrimeiroAnoPct, criado.perdaAnualConstantePct, 30);
  res.status(201).json({ atual: criado, previa });
});

export default router;
