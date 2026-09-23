import { NextFunction, Request, Response } from "express";
import { Acao, Modulo, permissaoCobre } from "../lib/permissoes";
import { prisma } from "../lib/prisma";

/// Extrai o id de usina do request (param > query > body), quando a rota é específica de uma usina.
function extrairUsinaId(req: Request): string | null {
  return (req.params.usinaId as string) || (req.query.usinaId as string) || (req.body?.usinaId as string) || null;
}

/// Middleware de autorização: sempre validado no servidor (nunca confiar em esconder botão no
/// frontend). ADMIN passa direto.
/// - Rota referencia uma usina específica (usinaId no param/query/body): exige permissão para
///   essa usina exata (ou uma concessão "todas as usinas" compatível).
/// - Rota de listagem/agregação (sem usinaId no request, ex.: GET /usinas, GET /painel/resumo):
///   exige apenas alguma permissão para o módulo+ação — a filtragem por usina autorizada é feita
///   depois, dentro do handler, via usinasAutorizadas(). Negar aqui bloquearia indevidamente um
///   usuário cuja permissão é restrita a uma usina específica.
export function exigirPermissao(modulo: Modulo, acao: Acao) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const usuario = req.usuario;
    if (!usuario) return res.status(401).json({ erro: "Não autenticado." });
    if (usuario.perfil === "ADMIN") return next();

    const usinaId = extrairUsinaId(req);

    if (!usinaId) {
      const temAlgumaPermissao = usuario.permissoes.some((p) => p.modulo === modulo && p.acao === acao);
      if (!temAlgumaPermissao) return res.status(403).json({ erro: "Sem permissão para esta ação." });
      return next();
    }

    let usinaFoiCriadaDepois = false;
    const permissoesSemUsinaEspecifica = usuario.permissoes.filter(
      (p) => p.usinaId === null && p.modulo === modulo && p.acao === acao
    );
    if (permissoesSemUsinaEspecifica.length > 0) {
      const usina = await prisma.usina.findUnique({ where: { id: usinaId }, select: { criadoEm: true } });
      const concessaoMaisAntiga = await prisma.permissao.findFirst({
        where: { usuarioId: usuario.id, usinaId: null, modulo, acao },
        orderBy: { criadoEm: "asc" },
      });
      if (usina && concessaoMaisAntiga && usina.criadoEm > concessaoMaisAntiga.criadoEm) {
        usinaFoiCriadaDepois = true;
      }
    }

    const permitido = permissaoCobre(usuario.permissoes, usinaId, modulo, acao, usinaFoiCriadaDepois);
    if (!permitido) return res.status(403).json({ erro: "Sem permissão para esta ação." });
    next();
  };
}

/// Retorna a lista de usinaIds autorizados para o usuário num módulo+ação, ou null se autorizado
/// para todas as usinas (uso em consultas agregadas: painel consolidado, comparativo, ranking).
export async function usinasAutorizadas(
  usuario: { id: string; perfil: string; permissoes: { usinaId: string | null; incluirFuturas: boolean; modulo: string; acao: string }[] },
  modulo: Modulo,
  acao: Acao
): Promise<string[] | null> {
  if (usuario.perfil === "ADMIN") return null;

  const temTodas = usuario.permissoes.some((p) => p.usinaId === null && p.modulo === modulo && p.acao === acao);
  if (temTodas) return null;

  return usuario.permissoes
    .filter((p) => p.usinaId !== null && p.modulo === modulo && p.acao === acao)
    .map((p) => p.usinaId as string);
}
