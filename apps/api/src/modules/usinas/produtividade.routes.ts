import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

/// Produtividade — geração diária por inversor, agrupada por SKID. O "máximo do dia" é o maior
/// valor entre os inversores do MESMO SKID naquele dia; a tela colore cada célula pela razão
/// valor ÷ máximo (verde 95–100%, amarelo 90–95%, vermelho < 90%). Só entram dias com ao menos um
/// lançamento no SKID — dia sem dado não vira zero.
router.get("/:usinaId/produtividade", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const skids = await prisma.skid.findMany({
    where: { usinaId: req.params.usinaId, ativo: true },
    orderBy: { nome: "asc" },
    include: { inversores: { where: { ativo: true }, orderBy: { identificacao: "asc" }, select: { id: true, identificacao: true } } },
  });

  const lancamentos = await prisma.lancamentoGeracaoDiaria.findMany({
    where: { usinaId: req.params.usinaId, inversorId: { not: null }, skidId: { not: null }, data: { gte: inicio, lte: fim } },
    select: { data: true, skidId: true, inversorId: true, energiaKwh: true },
  });

  const resultado = skids.map((skid) => {
    const doSkid = lancamentos.filter((l) => l.skidId === skid.id);
    const porDia = new Map<string, Record<string, number>>();
    for (const l of doSkid) {
      const chave = l.data.toISOString().slice(0, 10);
      if (!porDia.has(chave)) porDia.set(chave, {});
      const valores = porDia.get(chave)!;
      valores[l.inversorId!] = (valores[l.inversorId!] ?? 0) + l.energiaKwh;
    }
    const dias = [...porDia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, valores]) => ({ data, valores, maximoKwh: Math.max(...Object.values(valores)) }));
    return { id: skid.id, nome: skid.nome, inversores: skid.inversores, dias };
  });

  res.json({ periodo: { inicio, fim }, skids: resultado });
});

export default router;
