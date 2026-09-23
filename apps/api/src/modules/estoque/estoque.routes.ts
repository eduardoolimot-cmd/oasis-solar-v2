import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { assinaturaValida, uploadFoto, UPLOADS_DIR } from "../../lib/upload";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Estoque — catálogo global de itens (compartilhado entre usinas) + saldo/custo médio ponderado e
// movimentações por usina. Custo reconhecido no CONSUMO (SAIDA), nunca na compra (ENTRADA) — ver
// docs/DECISOES_PLACEHOLDER.md ("Reconhecimento de custo de O&M").

const router = Router();
router.use(autenticar);

// ---- Catálogo (global) ----

router.get("/catalogo", exigirPermissao("estoque", "visualizar"), async (req, res) => {
  const incluirInativos = req.query.incluirInativos === "true";
  const itens = await prisma.itemCatalogo.findMany({
    where: incluirInativos ? undefined : { ativo: true },
    orderBy: { nome: "asc" },
  });
  res.json(itens);
});

const criarItemSchema = z.object({
  nome: z.string().min(1),
  categoria: z.string().optional(),
  unidadeMedida: z.string().min(1).default("un"),
  estoqueMinimo: z.number().nonnegative().nullable().optional(),
});

router.post("/catalogo", exigirPermissao("estoque", "criar"), async (req, res) => {
  const parsed = criarItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const item = await prisma.itemCatalogo.create({ data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "estoque",
    entidade: "ItemCatalogo",
    entidadeId: item.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(item);
});

const editarItemSchema = criarItemSchema.partial().extend({ ativo: z.boolean().optional() });

router.put("/catalogo/:itemId", exigirPermissao("estoque", "editar"), async (req, res) => {
  const parsed = editarItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.itemCatalogo.findUnique({ where: { id: req.params.itemId } });
  if (!anterior) return res.status(404).json({ erro: "Item não encontrado." });

  const item = await prisma.itemCatalogo.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "estoque",
    entidade: "ItemCatalogo",
    entidadeId: item.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(item);
});

// Exclusão definitiva do item do catálogo (com saldos e movimentações dele, via cascata). Como isso
// apaga histórico de estoque, só é permitido enquanto o item não tiver movimentação registrada —
// com histórico, use a desativação (ativo=false) pela edição, que preserva a trilha.
router.delete("/catalogo/:itemId", exigirPermissao("estoque", "editar"), async (req, res) => {
  const item = await prisma.itemCatalogo.findUnique({ where: { id: req.params.itemId } });
  if (!item) return res.status(404).json({ erro: "Item não encontrado." });

  const movimentacoes = await prisma.movimentacaoEstoque.count({ where: { itemId: item.id } });
  if (movimentacoes > 0) {
    return res.status(409).json({ erro: "Este item já tem movimentações de estoque — desative-o em vez de excluir, para preservar o histórico." });
  }

  if (item.imagemUrl) fs.rm(path.join(UPLOADS_DIR, path.basename(item.imagemUrl)), { force: true }, () => {});
  await prisma.itemCatalogo.delete({ where: { id: item.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "estoque",
    entidade: "ItemCatalogo",
    entidadeId: item.id,
    acao: "CANCELAMENTO",
    valorAnterior: item,
    valorNovo: null,
  });

  res.status(204).end();
});

// Imagem do item (uma por item, mesmo padrão da foto da usina — ver lib/upload.ts). Substituição
// só apaga o arquivo antigo depois que o novo já está gravado.
router.post(
  "/catalogo/:itemId/imagem",
  exigirPermissao("estoque", "editar"),
  uploadFoto.single("imagem"),
  async (req, res) => {
    const item = await prisma.itemCatalogo.findUnique({ where: { id: req.params.itemId } });
    if (!item) return res.status(404).json({ erro: "Item não encontrado." });
    if (!req.file) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    const buffer = fs.readFileSync(req.file.path);
    if (!assinaturaValida(buffer, req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ erro: "Arquivo não corresponde a uma imagem JPG, PNG ou WebP válida." });
    }

    const imagemAnterior = item.imagemUrl;
    await prisma.itemCatalogo.update({ where: { id: item.id }, data: { imagemUrl: `/uploads/${req.file.filename}` } });

    if (imagemAnterior) {
      const caminhoAnterior = path.join(UPLOADS_DIR, path.basename(imagemAnterior));
      fs.rm(caminhoAnterior, { force: true }, () => {});
    }

    await registrarAuditoria({
      usuarioId: req.usuario!.id,
      modulo: "estoque",
      entidade: "ItemCatalogo",
      entidadeId: item.id,
      acao: "EDICAO",
      campo: "imagemUrl",
      valorAnterior: imagemAnterior,
      valorNovo: `/uploads/${req.file.filename}`,
    });

    res.json({ imagemUrl: `/uploads/${req.file.filename}` });
  }
);

router.delete("/catalogo/:itemId/imagem", exigirPermissao("estoque", "editar"), async (req, res) => {
  const item = await prisma.itemCatalogo.findUnique({ where: { id: req.params.itemId } });
  if (!item) return res.status(404).json({ erro: "Item não encontrado." });
  if (!item.imagemUrl) return res.status(204).end();

  const caminho = path.join(UPLOADS_DIR, path.basename(item.imagemUrl));
  fs.rm(caminho, { force: true }, () => {});
  await prisma.itemCatalogo.update({ where: { id: item.id }, data: { imagemUrl: null } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "estoque",
    entidade: "ItemCatalogo",
    entidadeId: item.id,
    acao: "EDICAO",
    campo: "imagemUrl",
    valorAnterior: item.imagemUrl,
    valorNovo: null,
  });

  res.status(204).end();
});

// ---- Saldo e movimentações (por usina) ----

router.get("/:usinaId", exigirPermissao("estoque", "visualizar"), async (req, res) => {
  const itens = await prisma.itemCatalogo.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } });
  const saldos = await prisma.estoqueUsinaItem.findMany({ where: { usinaId: req.params.usinaId } });
  const saldoPorItem = new Map(saldos.map((s) => [s.itemId, s]));

  const resultado = itens.map((item) => {
    const saldo = saldoPorItem.get(item.id);
    return {
      itemId: item.id,
      nome: item.nome,
      categoria: item.categoria,
      unidadeMedida: item.unidadeMedida,
      estoqueMinimo: item.estoqueMinimo,
      imagemUrl: item.imagemUrl,
      saldoQuantidade: saldo?.saldoQuantidade ?? 0,
      custoMedioUnitario: saldo?.custoMedioUnitario ?? null,
      abaixoDoMinimo: item.estoqueMinimo !== null && (saldo?.saldoQuantidade ?? 0) < item.estoqueMinimo,
    };
  });
  res.json(resultado);
});

router.get("/:usinaId/movimentacoes", exigirPermissao("estoque", "visualizar"), async (req, res) => {
  const movimentacoes = await prisma.movimentacaoEstoque.findMany({
    where: { usinaId: req.params.usinaId, ...(req.query.itemId ? { itemId: String(req.query.itemId) } : {}) },
    include: { item: { select: { id: true, nome: true, unidadeMedida: true } }, ordemServico: { select: { id: true, titulo: true } } },
    orderBy: { criadoEm: "desc" },
    take: 200,
  });
  res.json(movimentacoes);
});

const entradaSaidaSchema = z.object({
  itemId: z.string(),
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  quantidade: z.number().positive(),
  custoUnitario: z.number().nonnegative().nullable().optional(), // obrigatório em ENTRADA; ignorado em SAIDA (usa o custo médio vigente)
  ordemServicoId: z.string().nullable().optional(), // só faz sentido em SAIDA (consumo vinculado a uma OS)
});

router.post("/:usinaId/movimentacoes", exigirPermissao("estoque", "movimentar"), async (req, res) => {
  const parsed = entradaSaidaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });
  const { itemId, tipo, quantidade, ordemServicoId } = parsed.data;

  if (tipo === "ENTRADA" && (parsed.data.custoUnitario === null || parsed.data.custoUnitario === undefined)) {
    return res.status(400).json({ erro: "Informe o custo unitário na entrada." });
  }

  const item = await prisma.itemCatalogo.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ erro: "Item não encontrado no catálogo." });

  const resultado = await prisma.$transaction(async (tx) => {
    const saldoAtual = await tx.estoqueUsinaItem.findUnique({ where: { usinaId_itemId: { usinaId: req.params.usinaId, itemId } } });
    const saldoAnterior = saldoAtual?.saldoQuantidade ?? 0;
    const custoMedioAnterior = saldoAtual?.custoMedioUnitario ?? null;

    let novoSaldo: number;
    let novoCustoMedio: number | null;
    let custoUnitarioMovimentacao: number | null;

    if (tipo === "ENTRADA") {
      const custoEntrada = parsed.data.custoUnitario!;
      novoSaldo = saldoAnterior + quantidade;
      // Custo médio ponderado: recalculado a cada entrada (nunca na saída).
      novoCustoMedio = saldoAnterior > 0 && custoMedioAnterior !== null
        ? (saldoAnterior * custoMedioAnterior + quantidade * custoEntrada) / novoSaldo
        : custoEntrada;
      custoUnitarioMovimentacao = custoEntrada;
    } else {
      if (quantidade > saldoAnterior) {
        throw new Error("SALDO_INSUFICIENTE");
      }
      novoSaldo = saldoAnterior - quantidade;
      novoCustoMedio = custoMedioAnterior; // saída não altera o custo médio
      custoUnitarioMovimentacao = custoMedioAnterior; // custo reconhecido no consumo, pelo custo médio vigente
    }

    await tx.estoqueUsinaItem.upsert({
      where: { usinaId_itemId: { usinaId: req.params.usinaId, itemId } },
      create: { usinaId: req.params.usinaId, itemId, saldoQuantidade: novoSaldo, custoMedioUnitario: novoCustoMedio },
      update: { saldoQuantidade: novoSaldo, custoMedioUnitario: novoCustoMedio },
    });

    return tx.movimentacaoEstoque.create({
      data: {
        usinaId: req.params.usinaId,
        itemId,
        tipo,
        quantidade,
        custoUnitario: custoUnitarioMovimentacao,
        ordemServicoId: tipo === "SAIDA" ? ordemServicoId ?? null : null,
        usuarioId: req.usuario!.id,
      },
    });
  }).catch((err: Error) => {
    if (err.message === "SALDO_INSUFICIENTE") return null;
    throw err;
  });

  if (!resultado) return res.status(409).json({ erro: "Saldo insuficiente para esta saída." });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "estoque",
    entidade: "MovimentacaoEstoque",
    entidadeId: resultado.id,
    acao: "MOVIMENTACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(resultado);
});

const ajusteSchema = z.object({
  itemId: z.string(),
  novoSaldo: z.number().nonnegative(),
  motivo: z.string().min(1),
});

// Ajuste de inventário — define o saldo físico contado, não soma/subtrai. Exige permissão própria
// (estoque.ajustar, distinta de estoque.movimentar) e justificativa obrigatória.
router.post("/:usinaId/ajustes", exigirPermissao("estoque", "ajustar"), async (req, res) => {
  const parsed = ajusteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });
  const { itemId, novoSaldo, motivo } = parsed.data;

  const item = await prisma.itemCatalogo.findUnique({ where: { id: itemId } });
  if (!item) return res.status(404).json({ erro: "Item não encontrado no catálogo." });

  const movimentacao = await prisma.$transaction(async (tx) => {
    const saldoAtual = await tx.estoqueUsinaItem.findUnique({ where: { usinaId_itemId: { usinaId: req.params.usinaId, itemId } } });

    await tx.estoqueUsinaItem.upsert({
      where: { usinaId_itemId: { usinaId: req.params.usinaId, itemId } },
      create: { usinaId: req.params.usinaId, itemId, saldoQuantidade: novoSaldo, custoMedioUnitario: saldoAtual?.custoMedioUnitario ?? null },
      update: { saldoQuantidade: novoSaldo },
    });

    // "quantidade" registra o saldo absoluto resultante do ajuste (não uma variação) — a diferença
    // fica explícita comparando com a movimentação anterior do item no histórico.
    return tx.movimentacaoEstoque.create({
      data: { usinaId: req.params.usinaId, itemId, tipo: "AJUSTE", quantidade: novoSaldo, motivo, usuarioId: req.usuario!.id },
    });
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "estoque",
    entidade: "MovimentacaoEstoque",
    entidadeId: movimentacao.id,
    acao: "MOVIMENTACAO",
    justificativa: motivo,
    valorNovo: parsed.data,
  });

  res.status(201).json(movimentacao);
});

export default router;
