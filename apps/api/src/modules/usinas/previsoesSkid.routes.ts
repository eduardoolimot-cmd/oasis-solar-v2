import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { recalcularPrevisaoUsina } from "../../lib/previsaoUsinaSkid";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Cadastro de Usina — dados mensais por SKID (Geração Mensal E_Grid, Irradiação Mensal Efetiva
// GlobEff, PR Mensal), os mesmos 3 indicadores das tabelas PVsyst empilhadas usadas na importação
// inicial dos dados reais. Ao salvar uma nova versão para um SKID, a rota recalcula e grava uma
// nova versão de PrevisaoMensal (nível da usina) — regras em lib/previsaoUsinaSkid.ts (soma de
// energia entre SKIDs; irradiação e PR ponderados por potência instalada, nunca média simples).
// "Geração Mensal" é digitada como total do SKID; a divisão por
// inversor é sempre automática (soma igual entre os inversores ativos do SKID) e calculada em
// tempo de leitura — não persistida por inversor, pois não há grandeza própria de inversor na fonte
// PVsyst (ver docs/DECISOES_PLACEHOLDER.md).

const router = Router();
router.use(autenticar);

function anoDaQuery(req: import("express").Request): number {
  const ano = Number(req.query.ano);
  return Number.isInteger(ano) && ano > 2000 ? ano : new Date().getFullYear();
}

async function montarGradeSkid(usinaId: string, skidId: string, ano: number) {
  const linhas = await prisma.previsaoMensalSkid.findMany({ where: { skidId, ano, ativo: true }, orderBy: { mes: "asc" } });
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const linha = linhas.find((l) => l.mes === mes);
    return {
      mes,
      geracaoEGridKwh: linha?.geracaoEGridKwh ?? null,
      irradiacaoGlobEffKwhM2: linha?.irradiacaoGlobEffKwhM2 ?? null,
      prPct: linha?.prPct ?? null,
    };
  });
  return {
    versao: linhas[0]?.versao ?? null,
    documentoOrigem: linhas[0]?.documentoOrigem ?? null,
    responsavel: linhas[0]?.responsavel ?? null,
    meses,
  };
}

async function montarRespostaSkid(usinaId: string, skid: { id: string; nome: string; potenciaFvKwp: number | null; inversores: { id: string; identificacao: string }[] }, ano: number) {
  const grade = await montarGradeSkid(usinaId, skid.id, ano);
  const nInversores = skid.inversores.length;
  const porInversor = grade.meses.map((m) => ({
    mes: m.mes,
    // Divisão automática: total do SKID / nº de inversores ativos vinculados a ele. Não
    // calculável (null) sem inversores vinculados — nunca dividido por zero.
    geracaoEGridKwh: m.geracaoEGridKwh !== null && nInversores > 0 ? m.geracaoEGridKwh / nInversores : null,
  }));
  return {
    skidId: skid.id,
    nome: skid.nome,
    potenciaFvKwp: skid.potenciaFvKwp,
    inversores: skid.inversores,
    ...grade,
    porInversor,
  };
}

router.get("/:usinaId/previsoes-skid", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  const ano = anoDaQuery(req);
  const skids = await prisma.skid.findMany({
    where: { usinaId: req.params.usinaId, ativo: true },
    include: { inversores: { where: { ativo: true }, select: { id: true, identificacao: true } } },
    orderBy: { nome: "asc" },
  });

  const resultado = await Promise.all(skids.map((skid) => montarRespostaSkid(req.params.usinaId, skid, ano)));

  const previsaoUsina = await prisma.previsaoMensal.findFirst({ where: { usinaId: req.params.usinaId, ano, ativo: true }, orderBy: { mes: "asc" } });

  res.json({
    ano,
    skids: resultado,
    previsaoUsinaVigente: previsaoUsina
      ? { versao: previsaoUsina.versao, atualizadoEm: previsaoUsina.criadoEm }
      : null,
  });
});

const linhaSchema = z.object({
  mes: z.number().int().min(1).max(12),
  geracaoEGridKwh: z.number().nullable().optional(),
  irradiacaoGlobEffKwhM2: z.number().nullable().optional(),
  prPct: z.number().nullable().optional(),
});

const salvarSchema = z.object({
  meses: z.array(linhaSchema).length(12),
  documentoOrigem: z.string().optional(),
  responsavel: z.string().optional(),
});

router.put("/:usinaId/skids/:skidId/previsoes-skid", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const ano = anoDaQuery(req);
  const parsed = salvarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const meses = new Set(parsed.data.meses.map((m) => m.mes));
  if (meses.size !== 12) return res.status(400).json({ erro: "Envie exatamente os 12 meses do ano." });

  const skid = await prisma.skid.findFirst({ where: { id: req.params.skidId, usinaId: req.params.usinaId } });
  if (!skid) return res.status(404).json({ erro: "SKID não encontrado." });

  const versaoAnterior = await prisma.previsaoMensalSkid.findFirst({
    where: { skidId: skid.id, ano },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });
  const novaVersao = (versaoAnterior?.versao ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.previsaoMensalSkid.updateMany({ where: { skidId: skid.id, ano, ativo: true }, data: { ativo: false } });
    await tx.previsaoMensalSkid.createMany({
      data: parsed.data.meses.map((m) => ({
        usinaId: req.params.usinaId,
        skidId: skid.id,
        ano,
        mes: m.mes,
        versao: novaVersao,
        geracaoEGridKwh: m.geracaoEGridKwh ?? null,
        irradiacaoGlobEffKwhM2: m.irradiacaoGlobEffKwhM2 ?? null,
        prPct: m.prPct ?? null,
        documentoOrigem: parsed.data.documentoOrigem ?? null,
        responsavel: parsed.data.responsavel ?? null,
      })),
    });
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "cadastro_usinas",
    entidade: "PrevisaoMensalSkid",
    entidadeId: skid.id,
    acao: "EDICAO",
    justificativa: `SKID ${skid.nome} — nova versão ${novaVersao} (ano ${ano})`,
    valorAnterior: versaoAnterior?.versao ?? null,
    valorNovo: novaVersao,
  });

  await recalcularPrevisaoUsina(req.params.usinaId, ano, req.usuario!.id, "Recalculada a partir da previsão mensal por SKID");

  const skidComInversores = await prisma.skid.findUniqueOrThrow({
    where: { id: skid.id },
    include: { inversores: { where: { ativo: true }, select: { id: true, identificacao: true } } },
  });
  const resposta = await montarRespostaSkid(req.params.usinaId, skidComInversores, ano);
  res.json({ ...resposta, previsaoUsinaRecalculada: true });
});

export default router;
