import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { resolverPeriodo } from "../../lib/periodo";
import { prisma } from "../../lib/prisma";
import { gerarCsv, gerarExcel, gerarPdf } from "../../lib/relatorioArquivo";
import {
  gerarCsv as gerarCsvLegado,
  gerarExcel as gerarExcelLegado,
  gerarPdf as gerarPdfLegado,
  RelatorioSnapshot as RelatorioSnapshotLegado,
} from "../../lib/relatorioLegado";
import { montarRelatorioSnapshot, RelatorioSnapshot } from "../../lib/relatorioSnapshot";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Relatórios (Fase 8) — gerar grava uma "fotografia" dos dados (RelatorioEmitido.dadosSnapshot) e
// nunca é apagado automaticamente; baixar de novo (mesmo formato ou outro) sempre regera o arquivo
// a partir desse snapshot, nunca recalcula com dados atuais — ver docs/DECISOES_PLACEHOLDER.md.

const router = Router();
router.use(autenticar);

const FORMATOS = ["PDF", "XLSX", "CSV"] as const;

type SnapshotGuardado = RelatorioSnapshot | RelatorioSnapshotLegado;

function ehNovo(snapshot: SnapshotGuardado): snapshot is RelatorioSnapshot {
  return (snapshot as RelatorioSnapshot).versao === 2;
}

function nomeArquivo(snapshot: SnapshotGuardado, formato: string): string {
  const inicio = snapshot.periodo.inicio.slice(0, 10);
  const fim = snapshot.periodo.fim.slice(0, 10);
  const ext = formato === "PDF" ? "pdf" : formato === "XLSX" ? "xlsx" : "csv";
  const nomeUsina = snapshot.usina.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
  return `relatorio_${nomeUsina}_${inicio}_a_${fim}.${ext}`;
}

// Relatórios emitidos no formato antigo (sem "versao") são reabertos exatamente como foram emitidos.
async function enviarArquivo(res: import("express").Response, snapshot: SnapshotGuardado, formato: string) {
  const nome = nomeArquivo(snapshot, formato);
  if (formato === "PDF") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    const doc = ehNovo(snapshot) ? gerarPdf(snapshot) : gerarPdfLegado(snapshot);
    doc.pipe(res);
    doc.end();
    return;
  }
  if (formato === "XLSX") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    const buffer = ehNovo(snapshot) ? await gerarExcel(snapshot) : await gerarExcelLegado(snapshot);
    res.send(Buffer.from(buffer));
    return;
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(ehNovo(snapshot) ? gerarCsv(snapshot) : gerarCsvLegado(snapshot));
}

const gerarSchema = z.object({
  responsavel: z.string().optional(),
  formato: z.enum(FORMATOS),
});

router.post("/:usinaId/relatorios", exigirPermissao("relatorios", "criar"), async (req, res) => {
  const parsed = gerarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const { inicio, fim } = resolverPeriodo(req.query);
  const snapshot = await montarRelatorioSnapshot(req.params.usinaId, inicio, fim, parsed.data.responsavel ?? null);
  if (!snapshot) return res.status(404).json({ erro: "Usina não encontrada." });

  const relatorio = await prisma.relatorioEmitido.create({
    data: {
      usinaId: req.params.usinaId,
      tipo: "DESEMPENHO",
      formato: parsed.data.formato,
      periodoInicio: inicio,
      periodoFim: fim,
      responsavel: parsed.data.responsavel ?? null,
      dadosSnapshot: JSON.stringify(snapshot),
      criadoPorId: req.usuario!.id,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "relatorios",
    entidade: "RelatorioEmitido",
    entidadeId: relatorio.id,
    acao: "CRIACAO",
    justificativa: `Relatório de Desempenho (${parsed.data.formato}) — ${inicio.toISOString().slice(0, 10)} a ${fim.toISOString().slice(0, 10)}`,
  });

  await enviarArquivo(res, snapshot, parsed.data.formato);
});

router.get("/:usinaId/relatorios", exigirPermissao("relatorios", "visualizar"), async (req, res) => {
  const relatorios = await prisma.relatorioEmitido.findMany({
    where: { usinaId: req.params.usinaId },
    select: { id: true, tipo: true, formato: true, periodoInicio: true, periodoFim: true, responsavel: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
  });
  res.json(relatorios);
});

router.get("/:usinaId/relatorios/:relatorioId/arquivo", exigirPermissao("relatorios", "visualizar"), async (req, res) => {
  const relatorio = await prisma.relatorioEmitido.findFirst({ where: { id: req.params.relatorioId, usinaId: req.params.usinaId } });
  if (!relatorio) return res.status(404).json({ erro: "Relatório não encontrado." });

  const formato = typeof req.query.formato === "string" && (FORMATOS as readonly string[]).includes(req.query.formato) ? req.query.formato : relatorio.formato;
  const snapshot = JSON.parse(relatorio.dadosSnapshot) as SnapshotGuardado;
  await enviarArquivo(res, snapshot, formato);
});

export default router;
