import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { assinaturaValida, uploadFoto, UPLOADS_DIR } from "../../lib/upload";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Ordens de Serviço — quadro Kanban (por status) e calendário (por dataPrevista). Podem ser
// editadas e excluídas; toda alteração/exclusão é registrada na auditoria.

const router = Router();
router.use(autenticar);

const STATUS = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const;
const TIPOS = ["CORRETIVA", "PREVENTIVA"] as const;
const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA"] as const;

router.get("/:usinaId/ordens-servico", exigirPermissao("manutencao", "visualizar"), async (req, res) => {
  const { status, tipo, desde, ate } = req.query;
  const ordens = await prisma.ordemServico.findMany({
    where: {
      usinaId: req.params.usinaId,
      ...(status ? { status: String(status) } : {}),
      ...(tipo ? { tipo: String(tipo) } : {}),
      ...(desde || ate
        ? {
            dataPrevista: {
              ...(desde ? { gte: new Date(String(desde)) } : {}),
              ...(ate ? { lte: new Date(String(ate)) } : {}),
            },
          }
        : {}),
    },
    include: {
      skid: { select: { id: true, nome: true } },
      planoPreventivo: { select: { id: true, titulo: true } },
      fotos: { select: { id: true, url: true, criadoEm: true }, orderBy: { criadoEm: "asc" } },
    },
    orderBy: [{ status: "asc" }, { prioridade: "desc" }, { criadoEm: "desc" }],
  });
  res.json(ordens);
});

const criarSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string().optional(),
  tipo: z.enum(TIPOS).default("CORRETIVA"),
  prioridade: z.enum(PRIORIDADES).default("MEDIA"),
  skidId: z.string().nullable().optional(),
  dataPrevista: z.coerce.date().nullable().optional(),
  responsavelId: z.string().nullable().optional(),
});

router.post("/:usinaId/ordens-servico", exigirPermissao("manutencao", "criar"), async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const os = await prisma.ordemServico.create({
    data: { ...parsed.data, usinaId: req.params.usinaId, criadoPorId: req.usuario!.id },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: os.id,
    acao: "CRIACAO",
    valorNovo: parsed.data,
  });

  res.status(201).json(os);
});

const editarSchema = criarSchema.partial();

router.put("/:usinaId/ordens-servico/:osId", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.ordemServico.findFirst({ where: { id: req.params.osId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Ordem de Serviço não encontrada." });

  const os = await prisma.ordemServico.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: os.id,
    acao: "EDICAO",
    valorAnterior: anterior,
    valorNovo: parsed.data,
  });

  res.json(os);
});

// Exclusão definitiva (pedido explícito do usuário). Movimentações de estoque e eventos ligados a
// esta OS não são apagados — só perdem o vínculo (onDelete: SetNull). O que foi excluído fica na
// trilha de auditoria; para apenas encerrar sem apagar, use o status CANCELADA.
router.delete("/:usinaId/ordens-servico/:osId", exigirPermissao("manutencao", "cancelar"), async (req, res) => {
  const anterior = await prisma.ordemServico.findFirst({
    where: { id: req.params.osId, usinaId: req.params.usinaId },
    include: { fotos: { select: { url: true } } },
  });
  if (!anterior) return res.status(404).json({ erro: "Ordem de Serviço não encontrada." });

  // Fotos são removidas em cascata no banco (onDelete: Cascade); os arquivos em disco não têm
  // vínculo com o SGBD e precisam ser apagados aqui.
  for (const foto of anterior.fotos) fs.rm(path.join(UPLOADS_DIR, path.basename(foto.url)), { force: true }, () => {});

  await prisma.ordemServico.delete({ where: { id: anterior.id } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: anterior.id,
    acao: "CANCELAMENTO",
    justificativa: "Ordem de Serviço excluída",
    valorAnterior: anterior,
    valorNovo: null,
  });

  res.status(204).end();
});

// ---- Fotos da OS (antes/depois do reparo, evidência da execução) ----
// Até 8 arquivos por envio; cada um validado pela assinatura binária real (não só o Content-Type
// informado pelo navegador), mesmo padrão da foto da usina e da imagem do item de estoque.
router.post(
  "/:usinaId/ordens-servico/:osId/fotos",
  exigirPermissao("manutencao", "editar"),
  uploadFoto.array("fotos", 8),
  async (req, res) => {
    const os = await prisma.ordemServico.findFirst({ where: { id: req.params.osId, usinaId: req.params.usinaId } });
    const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!os) {
      arquivos.forEach((a) => fs.rm(a.path, { force: true }, () => {}));
      return res.status(404).json({ erro: "Ordem de Serviço não encontrada." });
    }
    if (arquivos.length === 0) return res.status(400).json({ erro: "Nenhum arquivo enviado." });

    const validos: Express.Multer.File[] = [];
    const rejeitados: string[] = [];
    for (const arquivo of arquivos) {
      const buffer = fs.readFileSync(arquivo.path);
      if (assinaturaValida(buffer, arquivo.mimetype)) {
        validos.push(arquivo);
      } else {
        fs.rm(arquivo.path, { force: true }, () => {});
        rejeitados.push(arquivo.originalname);
      }
    }

    const criadas = await prisma.$transaction(
      validos.map((arquivo) =>
        prisma.fotoOrdemServico.create({
          data: { ordemServicoId: os.id, url: `/uploads/${arquivo.filename}`, criadoPorId: req.usuario!.id },
        })
      )
    );

    if (criadas.length > 0) {
      await registrarAuditoria({
        usuarioId: req.usuario!.id,
        usinaId: req.params.usinaId,
        modulo: "manutencao",
        entidade: "OrdemServico",
        entidadeId: os.id,
        acao: "EDICAO",
        campo: "fotos",
        justificativa: `${criadas.length} foto(s) anexada(s)`,
        valorNovo: criadas.map((f) => f.url),
      });
    }

    res.status(criadas.length > 0 ? 201 : 400).json({
      fotos: criadas,
      rejeitados: rejeitados.length ? rejeitados.map((nome) => `${nome}: arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.`) : undefined,
    });
  }
);

router.delete("/:usinaId/ordens-servico/:osId/fotos/:fotoId", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const foto = await prisma.fotoOrdemServico.findFirst({
    where: { id: req.params.fotoId, ordemServicoId: req.params.osId, ordemServico: { usinaId: req.params.usinaId } },
  });
  if (!foto) return res.status(404).json({ erro: "Foto não encontrada." });

  await prisma.fotoOrdemServico.delete({ where: { id: foto.id } });
  fs.rm(path.join(UPLOADS_DIR, path.basename(foto.url)), { force: true }, () => {});

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: req.params.osId,
    acao: "EDICAO",
    campo: "fotos",
    justificativa: "Foto removida",
    valorAnterior: foto.url,
  });

  res.status(204).end();
});

const statusSchema = z.object({ status: z.enum(STATUS) });

// Mudança de status — o que o quadro Kanban chama ao mover um cartão de coluna.
router.post("/:usinaId/ordens-servico/:osId/status", exigirPermissao("manutencao", "editar"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.ordemServico.findFirst({ where: { id: req.params.osId, usinaId: req.params.usinaId } });
  if (!anterior) return res.status(404).json({ erro: "Ordem de Serviço não encontrada." });

  const os = await prisma.ordemServico.update({
    where: { id: anterior.id },
    data: {
      status: parsed.data.status,
      dataConclusao: parsed.data.status === "CONCLUIDA" ? anterior.dataConclusao ?? new Date() : parsed.data.status !== anterior.status ? null : anterior.dataConclusao,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    usinaId: req.params.usinaId,
    modulo: "manutencao",
    entidade: "OrdemServico",
    entidadeId: os.id,
    acao: "EDICAO",
    justificativa: `Status alterado de ${anterior.status} para ${os.status}`,
    valorAnterior: anterior.status,
    valorNovo: os.status,
  });

  res.json(os);
});

export default router;
