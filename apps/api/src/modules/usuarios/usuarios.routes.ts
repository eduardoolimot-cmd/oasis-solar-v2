import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { autenticar, exigirAdmin } from "../../middleware/auth";

const router = Router();
router.use(autenticar, exigirAdmin); // módulo Usuários e Acessos é exclusivo do administrador

router.get("/", async (_req, res) => {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      email: true,
      perfil: true,
      ativo: true,
      ultimoAcesso: true,
      permissoes: { include: { usina: { select: { id: true, nome: true } } } },
    },
  });
  res.json(usuarios);
});

const permissaoSchema = z.object({
  usinaId: z.string().nullable(),
  incluirFuturas: z.boolean().default(false),
  modulo: z.string(),
  acao: z.string(),
});

const criarSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  perfil: z.enum(["ADMIN", "USUARIO"]).default("USUARIO"),
  permissoes: z.array(permissaoSchema).optional(),
});

router.post("/", async (req, res) => {
  const parsed = criarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) return res.status(409).json({ erro: "Já existe um usuário com este e-mail." });

  const senhaTemporaria = crypto.randomBytes(6).toString("base64url");
  const senhaHash = await bcrypt.hash(senhaTemporaria, 12);

  const { permissoes, ...dadosUsuario } = parsed.data;
  const usuario = await prisma.usuario.create({
    data: {
      ...dadosUsuario,
      senhaHash,
      // Administrador tem acesso irrestrito — permissões só fazem sentido para o perfil USUARIO.
      permissoes: dadosUsuario.perfil === "USUARIO" && permissoes?.length ? { create: permissoes } : undefined,
    },
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "CRIACAO",
    valorNovo: { nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, permissoes: permissoes?.length ?? 0 },
  });

  // Senha temporária retornada apenas nesta resposta única; nunca fica gravada em texto aberto.
  res.status(201).json({ id: usuario.id, senhaTemporaria });
});

const editarSchema = z.object({
  nome: z.string().min(1).optional(),
  email: z.string().email().optional(),
  perfil: z.enum(["ADMIN", "USUARIO"]).optional(),
});

router.put("/:id", async (req, res) => {
  const parsed = editarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const anterior = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!anterior) return res.status(404).json({ erro: "Usuário não encontrado." });

  if (anterior.perfil === "ADMIN" && parsed.data.perfil === "USUARIO") {
    const outrosAdmins = await prisma.usuario.count({
      where: { perfil: "ADMIN", ativo: true, id: { not: anterior.id } },
    });
    if (outrosAdmins === 0) {
      return res.status(409).json({ erro: "Não é possível remover o último administrador ativo." });
    }
  }

  const usuario = await prisma.usuario.update({ where: { id: anterior.id }, data: parsed.data });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "EDICAO",
    valorAnterior: { nome: anterior.nome, email: anterior.email, perfil: anterior.perfil },
    valorNovo: { nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
  });

  res.json({ id: usuario.id });
});

router.post("/:id/desativar", async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

  if (usuario.perfil === "ADMIN") {
    const outrosAdmins = await prisma.usuario.count({
      where: { perfil: "ADMIN", ativo: true, id: { not: usuario.id } },
    });
    if (outrosAdmins === 0) {
      return res.status(409).json({ erro: "Não é possível desativar o último administrador ativo." });
    }
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ativo: false, tokenVersion: { increment: 1 } }, // encerra sessões emitidas
  });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "DESATIVACAO",
  });

  res.status(204).end();
});

router.post("/:id/reativar", async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
  if (usuario.ativo) return res.status(409).json({ erro: "Usuário já está ativo." });

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ativo: true } });

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "EDICAO",
    justificativa: "Usuário reativado",
  });

  res.status(204).end();
});

router.post("/:id/redefinir-senha", async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

  const senhaTemporaria = crypto.randomBytes(6).toString("base64url");
  const senhaHash = await bcrypt.hash(senhaTemporaria, 12);

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { senhaHash, tokenVersion: { increment: 1 } },
  });

  // Nunca registrar a senha (atual, anterior, temporária ou token) na auditoria.
  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "EDICAO",
    justificativa: "Senha redefinida",
  });

  res.json({ senhaTemporaria });
});

const permissoesSchema = z.object({
  permissoes: z.array(
    z.object({
      usinaId: z.string().nullable(),
      incluirFuturas: z.boolean().default(false),
      modulo: z.string(),
      acao: z.string(),
    })
  ),
});

router.put("/:id/permissoes", async (req, res) => {
  const parsed = permissoesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: parsed.error.issues[0]?.message });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.params.id } });
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });

  await prisma.$transaction([
    prisma.permissao.deleteMany({ where: { usuarioId: usuario.id } }),
    prisma.permissao.createMany({
      data: parsed.data.permissoes.map((p) => ({ ...p, usuarioId: usuario.id })),
    }),
  ]);

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "usuarios",
    entidade: "Permissao",
    entidadeId: usuario.id,
    acao: "EDICAO",
    valorNovo: parsed.data.permissoes,
  });

  res.status(204).end();
});

export default router;
