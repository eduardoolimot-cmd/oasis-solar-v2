import ExcelJS from "exceljs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { ChaveMetrica, encontrarMetricaPorRotulo, MESES_ABREV, METRICAS } from "../../lib/metasMetricas";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

function anoDaQuery(req: import("express").Request): number {
  const ano = Number(req.query.ano);
  return Number.isInteger(ano) && ano > 2000 ? ano : new Date().getFullYear();
}

async function montarRespostaGrade(usinaId: string, ano: number) {
  const usina = await prisma.usina.findUnique({ where: { id: usinaId }, select: { potenciaAcKw: true } });
  const linhas = await prisma.previsaoMensal.findMany({ where: { usinaId, ano, ativo: true }, orderBy: { mes: "asc" } });
  const anual = await prisma.previsaoAnual.findFirst({ where: { usinaId, ano, ativo: true } });
  const ultimaImportacao = await prisma.importacaoMetas.findFirst({
    where: { usinaId, ano },
    orderBy: { criadoEm: "desc" },
  });

  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const linha = linhas.find((l) => l.mes === mes);
    return {
      mes,
      geracaoPrevistaKwh: linha?.geracaoPrevistaKwh ?? null,
      geracaoP50Kwh: linha?.geracaoP50Kwh ?? null,
      geracaoP90Kwh: linha?.geracaoP90Kwh ?? null,
      irradiacaoPrevistaKwhM2: linha?.irradiacaoPrevistaKwhM2 ?? null,
      prPrevistoPct: linha?.prPrevistoPct ?? null,
      dispGeracaoMetaPct: linha?.dispGeracaoMetaPct ?? null,
      dispComunicacaoMetaPct: linha?.dispComunicacaoMetaPct ?? null,
    };
  });

  const avisos: string[] = [];
  for (const m of meses) {
    if (m.geracaoP50Kwh !== null && m.geracaoP90Kwh !== null && m.geracaoP90Kwh > m.geracaoP50Kwh) {
      avisos.push(`Mês ${m.mes}: P90 de geração maior que P50 — conferir o estudo.`);
    }
  }

  return {
    ano,
    versao: linhas[0]?.versao ?? null,
    baseFcPotenciaAcKw: usina?.potenciaAcKw ?? null,
    meses,
    anual: anual
      ? {
          geracaoP50Kwh: anual.geracaoP50Kwh,
          geracaoP90Kwh: anual.geracaoP90Kwh,
        }
      : null,
    documentoOrigem: linhas[0]?.documentoOrigem ?? null,
    responsavel: linhas[0]?.responsavel ?? null,
    ultimaImportacao: ultimaImportacao
      ? { arquivo: ultimaImportacao.nomeArquivo, data: ultimaImportacao.criadoEm }
      : null,
    avisos,
  };
}

router.get("/:usinaId/previsoes", exigirPermissao("cadastro_usinas", "visualizar"), async (req, res) => {
  res.json(await montarRespostaGrade(req.params.usinaId, anoDaQuery(req)));
});

const linhaMensalSchema = z.object({
  mes: z.number().int().min(1).max(12),
  geracaoPrevistaKwh: z.number().nullable().optional(),
  geracaoP50Kwh: z.number().nullable().optional(),
  geracaoP90Kwh: z.number().nullable().optional(),
  irradiacaoPrevistaKwhM2: z.number().nullable().optional(),
  prPrevistoPct: z.number().nullable().optional(),
  dispGeracaoMetaPct: z.number().min(0).max(100).nullable().optional(),
  dispComunicacaoMetaPct: z.number().min(0).max(100).nullable().optional(),
});

const anualSchema = z
  .object({
    geracaoP50Kwh: z.number().nullable().optional(),
    geracaoP90Kwh: z.number().nullable().optional(),
  })
  .nullable()
  .optional();

const salvarGradeSchema = z.object({
  meses: z.array(linhaMensalSchema).length(12),
  anual: anualSchema,
  documentoOrigem: z.string().optional(),
  responsavel: z.string().optional(),
});

/// Salva a grade inteira como uma nova versão (nunca sobrescreve linhas existentes) — "Preservar
/// versões", "P50/P90 são valores de energia do estudo", "não ratear automaticamente".
async function salvarNovaVersao(
  usinaId: string,
  ano: number,
  dados: z.infer<typeof salvarGradeSchema>,
  usuarioId: string,
  origemImportacao?: { nomeArquivo: string }
) {
  const anteriorMax = await prisma.previsaoMensal.findFirst({
    where: { usinaId, ano },
    orderBy: { versao: "desc" },
    select: { versao: true },
  });
  const novaVersao = (anteriorMax?.versao ?? 0) + 1;

  // "Geração prevista", "Irradiação prevista" e "PR previsto" são alimentados por "Dados mensais
  // por SKID" (previsoesSkid.routes.ts), não por esta tela — a grade de Metas mensais nunca envia
  // esses 3 campos. Sem preservá-los da versão anterior, salvar aqui (mesmo só P50/P90 ou
  // disponibilidade) apagaria o que "Dados mensais por SKID" calculou.
  const anteriorPorMes = new Map(
    (await prisma.previsaoMensal.findMany({ where: { usinaId, ano, ativo: true } })).map((l) => [l.mes, l])
  );

  await prisma.$transaction(async (tx) => {
    await tx.previsaoMensal.updateMany({ where: { usinaId, ano, ativo: true }, data: { ativo: false } });
    await tx.previsaoAnual.updateMany({ where: { usinaId, ano, ativo: true }, data: { ativo: false } });

    await tx.previsaoMensal.createMany({
      data: dados.meses.map((m) => {
        const anterior = anteriorPorMes.get(m.mes);
        return {
          usinaId,
          ano,
          mes: m.mes,
          versao: novaVersao,
          geracaoPrevistaKwh: m.geracaoPrevistaKwh !== undefined ? m.geracaoPrevistaKwh : anterior?.geracaoPrevistaKwh ?? null,
          geracaoP50Kwh: m.geracaoP50Kwh ?? null,
          geracaoP90Kwh: m.geracaoP90Kwh ?? null,
          irradiacaoPrevistaKwhM2: m.irradiacaoPrevistaKwhM2 !== undefined ? m.irradiacaoPrevistaKwhM2 : anterior?.irradiacaoPrevistaKwhM2 ?? null,
          prPrevistoPct: m.prPrevistoPct !== undefined ? m.prPrevistoPct : anterior?.prPrevistoPct ?? null,
          dispGeracaoMetaPct: m.dispGeracaoMetaPct ?? null,
          dispComunicacaoMetaPct: m.dispComunicacaoMetaPct ?? null,
          documentoOrigem: dados.documentoOrigem ?? null,
          responsavel: dados.responsavel ?? null,
        };
      }),
    });

    if (dados.anual) {
      await tx.previsaoAnual.create({
        data: {
          usinaId,
          ano,
          versao: novaVersao,
          ...dados.anual,
          documentoOrigem: dados.documentoOrigem ?? null,
          responsavel: dados.responsavel ?? null,
        },
      });
    }

    if (origemImportacao) {
      await tx.importacaoMetas.create({
        data: {
          usinaId,
          usuarioId,
          ano,
          nomeArquivo: origemImportacao.nomeArquivo,
          versaoAnterior: anteriorMax?.versao ?? null,
          versaoNova: novaVersao,
        },
      });
    }
  });

  await registrarAuditoria({
    usuarioId,
    usinaId,
    modulo: "cadastro_usinas",
    entidade: "PrevisaoMensal",
    entidadeId: usinaId,
    acao: "EDICAO",
    justificativa: origemImportacao
      ? `Importado de ${origemImportacao.nomeArquivo} — nova versão ${novaVersao} (ano ${ano})`
      : `Nova versão ${novaVersao} (ano ${ano})`,
    valorAnterior: anteriorMax?.versao ?? null,
    valorNovo: novaVersao,
  });

  return novaVersao;
}

router.put("/:usinaId/previsoes", exigirPermissao("cadastro_usinas", "editar"), async (req, res) => {
  const ano = anoDaQuery(req);
  const parsed = salvarGradeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const meses = new Set(parsed.data.meses.map((m) => m.mes));
  if (meses.size !== 12) return res.status(400).json({ erro: "Envie exatamente os 12 meses do ano." });

  await salvarNovaVersao(req.params.usinaId, ano, parsed.data, req.usuario!.id);
  res.json(await montarRespostaGrade(req.params.usinaId, ano));
});

// ---- Exportação Excel ----

router.get("/:usinaId/previsoes/exportar", exigirPermissao("cadastro_usinas", "exportar"), async (req, res) => {
  const ano = anoDaQuery(req);
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const grade = await montarRespostaGrade(req.params.usinaId, ano);

  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet("Metas");

  planilha.addRow(["OASIS SOLAR — Metas mensais"]);
  planilha.addRow(["Usina", usina.nome]);
  planilha.addRow(["Ano", ano]);
  planilha.addRow(["Versão", grade.versao ?? "—"]);
  planilha.addRow([]);

  const cabecalho = planilha.addRow(["Métrica", "Unidade", ...MESES_ABREV]);
  cabecalho.font = { bold: true };

  for (const metrica of METRICAS) {
    const valores = grade.meses.map((m) => (m as Record<string, unknown>)[metrica.chave] as number | null);
    const linha = planilha.addRow([metrica.rotulo, metrica.unidade, ...valores.map((v) => v ?? "")]);
    if (metrica.calculada) linha.font = { italic: true, color: { argb: "FF878787" } };
  }

  planilha.columns.forEach((coluna) => {
    coluna.width = 16;
  });
  planilha.getColumn(1).width = 40;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="metas_${usina.identificadorInterno}_${ano}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ---- Importação Excel (prévia + confirmação em duas etapas, nunca aplica direto) ----

const uploadPlanilha = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

interface CelulaErro {
  mes: number;
  metrica: string;
  motivo: string;
}

interface PreviaImportacao {
  linhasReconhecidas: number;
  rotulosDesconhecidos: string[];
  rotulosDuplicados: string[];
  erros: CelulaErro[];
  meses: z.infer<typeof linhaMensalSchema>[];
}

router.post(
  "/:usinaId/previsoes/importar",
  exigirPermissao("cadastro_usinas", "editar"),
  uploadPlanilha.single("arquivo"),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
    } catch {
      return res.status(400).json({ erro: "Arquivo inválido. Envie um .xlsx exportado pelo sistema ou compatível." });
    }

    const planilha = workbook.worksheets[0];
    if (!planilha) return res.status(400).json({ erro: "Planilha vazia." });

    const meses: Record<number, Record<string, number | null>> = {};
    for (let m = 1; m <= 12; m++) meses[m] = {};

    const rotulosDesconhecidos: string[] = [];
    const rotulosVistos = new Map<ChaveMetrica, number>();
    const erros: CelulaErro[] = [];

    // Encontra a linha de cabeçalho (coluna A = "Métrica") em vez de assumir uma posição fixa,
    // já que o cabeçalho institucional (usina/ano/versão) ocupa linhas variáveis no topo.
    let linhaCabecalho = -1;
    planilha.eachRow((row, rowNumber) => {
      const primeiraCelula = String(row.getCell(1).value ?? "").trim().toLowerCase();
      if (primeiraCelula === "métrica" || primeiraCelula === "metrica") linhaCabecalho = rowNumber;
    });
    if (linhaCabecalho === -1) {
      return res.status(400).json({ erro: "Cabeçalho não encontrado (esperada a coluna 'Métrica')." });
    }

    planilha.eachRow((row, rowNumber) => {
      if (rowNumber <= linhaCabecalho) return;
      const rotuloBruto = String(row.getCell(1).value ?? "").trim();
      if (!rotuloBruto) return;

      const chave = encontrarMetricaPorRotulo(rotuloBruto);
      if (!chave) {
        rotulosDesconhecidos.push(rotuloBruto);
        return;
      }
      const definicao = METRICAS.find((m) => m.chave === chave)!;
      if (definicao.calculada) return; // FC é ignorado na importação — sempre recalculado

      rotulosVistos.set(chave, (rotulosVistos.get(chave) ?? 0) + 1);

      for (let mes = 1; mes <= 12; mes++) {
        const celula = row.getCell(2 + mes); // coluna 1=Métrica, 2=Unidade, 3..14=Jan..Dez
        const bruto = celula.value;
        if (bruto === null || bruto === undefined || bruto === "") continue;

        const texto = typeof bruto === "object" && bruto && "result" in bruto ? String((bruto as { result: unknown }).result) : String(bruto);
        const normalizado = texto.trim().replace(",", ".");
        const numero = Number(normalizado);
        if (Number.isNaN(numero)) {
          erros.push({ mes, metrica: definicao.rotulo, motivo: `Valor não numérico: "${texto}"` });
          continue;
        }
        meses[mes][chave] = numero;
      }
    });

    const rotulosDuplicados = [...rotulosVistos.entries()].filter(([, n]) => n > 1).map(([chave]) => chave);

    const linhasMontadas: z.infer<typeof linhaMensalSchema>[] = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1;
      return { mes, ...meses[mes] } as z.infer<typeof linhaMensalSchema>;
    });

    const previa: PreviaImportacao = {
      linhasReconhecidas: rotulosVistos.size,
      rotulosDesconhecidos,
      rotulosDuplicados,
      erros,
      meses: linhasMontadas,
    };

    res.json({ previa, nomeArquivo: req.file.originalname, atual: await montarRespostaGrade(req.params.usinaId, anoDaQuery(req)) });
  }
);

const confirmarImportacaoSchema = z.object({
  nomeArquivo: z.string(),
  meses: z.array(linhaMensalSchema).length(12),
  anual: anualSchema,
  documentoOrigem: z.string().optional(),
  responsavel: z.string().optional(),
});

// Só grava após confirmação explícita do usuário sobre a prévia — "Salvar a importação somente
// após validação e confirmação, em uma operação completa; cancelamento não altera o cadastro."
router.post(
  "/:usinaId/previsoes/importar/confirmar",
  exigirPermissao("cadastro_usinas", "editar"),
  async (req, res) => {
    const ano = anoDaQuery(req);
    const parsed = confirmarImportacaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

    await salvarNovaVersao(req.params.usinaId, ano, parsed.data, req.usuario!.id, {
      nomeArquivo: parsed.data.nomeArquivo,
    });

    res.json(await montarRespostaGrade(req.params.usinaId, ano));
  }
);

export default router;
