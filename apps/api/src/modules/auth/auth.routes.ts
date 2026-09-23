import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { assinarToken } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import { registrarAuditoria } from "../../lib/auditoria";
import { autenticar } from "../../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
  }
  const { email, senha } = parsed.data;

  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) {
    return res.status(401).json({ erro: "Credenciais inválidas." });
  }

  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaOk) {
    return res.status(401).json({ erro: "Credenciais inválidas." });
  }

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
  await registrarAuditoria({
    usuarioId: usuario.id,
    modulo: "usuarios",
    entidade: "Usuario",
    entidadeId: usuario.id,
    acao: "ACESSO",
  });

  const token = assinarToken({ sub: usuario.id, tv: usuario.tokenVersion });
  res.json({
    token,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
  });
});

router.get("/me", autenticar, async (req, res) => {
  const usuario = req.usuario!;
  res.json({
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    permissoes: usuario.permissoes,
  });
});

export default router;
