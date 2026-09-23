import { Router } from "express";
import { buscarClimaDiario } from "../../lib/clima";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

// Previsão/condição do tempo diária (Painel Principal, aba Geração de Energia Bruta) — API
// gratuita Open-Meteo, sem chave. Depende de latitude/longitude cadastradas na usina
// (Identificação); sem isso, "não calculável", nunca uma localização aproximada inventada.

const router = Router();
router.use(autenticar);

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

router.get("/:usinaId/clima", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId }, select: { latitude: true, longitude: true } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  if (usina.latitude === null || usina.longitude === null) {
    return res.json({
      disponivel: false,
      aviso: "Latitude/longitude não cadastradas para esta usina — cadastre em Identificação (Configurações da usina) para ver a previsão do tempo diária.",
      dias: [],
    });
  }

  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const dias = await buscarClimaDiario(usina.latitude, usina.longitude, inicio, fim);

  res.json({
    disponivel: true,
    aviso: dias.length === 0 ? "Nenhum dado de tempo disponível para o período selecionado (fora da cobertura da API gratuita)." : null,
    dias,
  });
});

export default router;
