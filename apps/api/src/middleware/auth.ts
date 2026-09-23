import { NextFunction, Request, Response } from "express";
import { verificarToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export interface UsuarioAutenticado {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  permissoes: { usinaId: string | null; incluirFuturas: boolean; modulo: string; acao: string }[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioAutenticado;
    }
  }
}

/// Valida o JWT e confirma que o usuário segue ativo e com a mesma tokenVersion (a versão muda
/// ao desativar o usuário ou redefinir a senha, encerrando sessões emitidas antes disso).
export async function autenticar(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Não autenticado." });
  }

  try {
    const payload = verificarToken(header.slice("Bearer ".length));
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.sub },
      include: { permissoes: true },
    });

    if (!usuario || !usuario.ativo || usuario.tokenVersion !== payload.tv) {
      return res.status(401).json({ erro: "Sessão inválida ou expirada." });
    }

    req.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      permissoes: usuario.permissoes.map((p) => ({
        usinaId: p.usinaId,
        incluirFuturas: p.incluirFuturas,
        modulo: p.modulo,
        acao: p.acao,
      })),
    };
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido." });
  }
}

export function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.usuario?.perfil !== "ADMIN") {
    return res.status(403).json({ erro: "Ação restrita ao administrador." });
  }
  next();
}
