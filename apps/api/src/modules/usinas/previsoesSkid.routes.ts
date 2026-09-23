import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Cadastro de Usina — dados mensais por SKID (Geração Mensal E_Grid, Irradiação Mensal Efetiva
// GlobEff, PR Mensal), os mesmos 3 indicadores das tabelas PVsyst empilhadas usadas na importação
// inicial dos dados reais. Ao salvar uma nova versão para um SKID, a rota recalcula e grava uma
// nova versão de PrevisaoMensal (nível da usina) — soma de energia entre SKIDs, irradiação e PR
// ponderados por potência instalada, nunca média simples (mesma fórmula de
// prisma/importar_dados_reais.ts). "Geração Mensal" é digitada como total do SKID; a divisão por
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

/// Recalcula e grava uma nova versão de PrevisaoMensal (nível da usina) a partir das versões
/// ativas de PrevisaoMensalSkid de TODOS os SKIDs — mesma fórmula ponderada por potência usada na
/// importação inicial. SKIDs sem dado no mês, ou sem potência cadastrada, são excluídos da soma
/// (nunca presumidos como zero). Preserva os demais campos (P50/P90/GHI/POA/disponibilidade,
/// alimentados pela seção "Metas mensais") copiando-os da versão anteriormente ativa.
async function recalcularPrevisaoUsina(usinaId: string, ano: number, usuarioId: string) {
  const skids = await prisma.skid.findMany({ where: { usinaId, ativo: true }, select: { id: true, potenciaFvKwp: true } });
  const linhasPorSkid = await prisma.previsaoMensalSkid.findMany({ where: { usinaId, ano, ativo: true } });

  const versaoAnteriorLinhas = await prisma.previsaoMensal.findMany({ where: { usinaId, ano, ativo: true } });
  const versaoAnterior = versaoAnteriorLinhas[0]?.versao ?? 0;
  const novaVersao = versaoAnterior + 1;

  const dadosMensais = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const anteriorMes = versaoAnteriorLinhas.find((l) => l.mes === mes);

    const porSkid = skids
      .map((skid) => ({
        potenciaKwp: skid.potenciaFvKwp,
        linha: linhasPorSkid.find((l) => l.skidId === skid.id && l.mes === mes),
      }))
      .filter((x): x is { potenciaKwp: number; linha: (typeof linhasPorSkid)[number] } => x.potenciaKwp !== null && x.potenciaKwp > 0 && x.linha?.geracaoEGridKwh !== undefined && x.linha?.geracaoEGridKwh !== null);

    // Só recalcula o agregado da usina para este mês quando TODOS os SKIDs ativos (com potência
    // cadastrada) têm dado nele — um mês/SKID ainda não preenchido nesta seção não pode apagar o
    // valor já existente (vindo da importação inicial ou de "Metas mensais"): "dado ausente ≠
    // zero" vale também para a cobertura entre SKIDs, não só entre meses.
    const skidsComPotencia = skids.filter((s) => s.potenciaFvKwp !== null && s.potenciaFvKwp > 0);
    const coberturaCompleta = skidsComPotencia.length > 0 && porSkid.length === skidsComPotencia.length;

    const geracaoTotalKwh = coberturaCompleta ? porSkid.reduce((s, x) => s + x.linha.geracaoEGridKwh!, 0) : null;
    const potenciaTotal = porSkid.reduce((s, x) => s + x.potenciaKwp, 0);
    const irradiacaoPonderada =
      coberturaCompleta && potenciaTotal > 0 && porSkid.every((x) => x.linha.irradiacaoGlobEffKwhM2 !== null)
        ? porSkid.reduce((s, x) => s + (x.linha.irradiacaoGlobEffKwhM2 ?? 0) * x.potenciaKwp, 0) / potenciaTotal
        : null;
    // PR previsto = PR Mensal (PVsyst) de cada SKID, ponderado por potência — mesmo critério da
    // irradiação (nunca média simples). Antes era derivado de energia/energia teórica, o que
    // divergia do PR realmente informado em "Dados mensais por SKID".
    const prPrevistoPct =
      coberturaCompleta && potenciaTotal > 0 && porSkid.every((x) => x.linha.prPct !== null)
        ? porSkid.reduce((s, x) => s + (x.linha.prPct ?? 0) * x.potenciaKwp, 0) / potenciaTotal
        : null;

    return {
      usinaId,
      ano,
      mes,
      versao: novaVersao,
      // Cobertura incompleta entre SKIDs para este mês: preserva o valor anterior (importado ou de
      // uma versão prévia) em vez de apagá-lo.
      geracaoPrevistaKwh: coberturaCompleta ? geracaoTotalKwh : anteriorMes?.geracaoPrevistaKwh ?? null,
      irradiacaoPrevistaKwhM2: coberturaCompleta ? irradiacaoPonderada : anteriorMes?.irradiacaoPrevistaKwhM2 ?? null,
      prPrevistoPct: coberturaCompleta ? prPrevistoPct : anteriorMes?.prPrevistoPct ?? null,
      // Campos alimentados por "Metas mensais" (não tocados por esta rota) — preservados da
      // versão anterior para nunca perder dado ao salvar uma previsão por SKID.
      geracaoP50Kwh: anteriorMes?.geracaoP50Kwh ?? null,
      geracaoP90Kwh: anteriorMes?.geracaoP90Kwh ?? null,
      dispGeracaoMetaPct: anteriorMes?.dispGeracaoMetaPct ?? null,
      dispComunicacaoMetaPct: anteriorMes?.dispComunicacaoMetaPct ?? null,
      documentoOrigem: "Cadastro de Usinas — dados mensais por SKID",
      responsavel: null,
    };
  });

  await prisma.previsaoMensal.updateMany({ where: { usinaId, ano, ativo: true }, data: { ativo: false } });
  await prisma.previsaoMensal.createMany({ data: dadosMensais });

  await registrarAuditoria({
    usuarioId,
    usinaId,
    modulo: "cadastro_usinas",
    entidade: "PrevisaoMensal",
    entidadeId: usinaId,
    acao: "EDICAO",
    justificativa: `Recalculada a partir da previsão mensal por SKID — nova versão ${novaVersao} (ano ${ano})`,
    valorAnterior: versaoAnterior || null,
    valorNovo: novaVersao,
  });
}

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

  await recalcularPrevisaoUsina(req.params.usinaId, ano, req.usuario!.id);

  const skidComInversores = await prisma.skid.findUniqueOrThrow({
    where: { id: skid.id },
    include: { inversores: { where: { ativo: true }, select: { id: true, identificacao: true } } },
  });
  const resposta = await montarRespostaSkid(req.params.usinaId, skidComInversores, ano);
  res.json({ ...resposta, previsaoUsinaRecalculada: true });
});

export default router;
