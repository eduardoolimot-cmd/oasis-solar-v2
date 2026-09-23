import { Router } from "express";
import { mesesInteiramenteCobertos } from "../../lib/mesesCobertos";
import { obterUltimoProcessamento, registrarProcessamento } from "../../lib/processamento";
import { prisma } from "../../lib/prisma";
import { calcularPrDiarioPareado, geracaoPorDia, irradiacaoRepresentativaPorDia } from "../../lib/seriesDiarias";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);
const ABA = "pr";

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

router.get("/:usinaId/pr", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const skids = await prisma.skid.findMany({ where: { usinaId: usina.id, ativo: true }, select: { id: true, nome: true, potenciaFvKwp: true }, orderBy: { nome: "asc" } });

  // PR realizado (usina inteira) — pareado dia a dia, nunca somando geração de um período contra
  // irradiação de cobertura diferente.
  const [irradiacaoUsina, geracaoUsina] = await Promise.all([
    irradiacaoRepresentativaPorDia(usina.id, inicio, fim),
    geracaoPorDia(usina.id, inicio, fim),
  ]);
  const resultadoUsina = calcularPrDiarioPareado(geracaoUsina, irradiacaoUsina, usina.potenciaDcKwp);

  // PR esperado (meta) — vem do PR Mensal (PVsyst) informado em "Dados mensais por SKID", já
  // ponderado por potência entre SKIDs (previsoesSkid.routes.ts). Para um período com mais de um
  // mês, pondera os meses entre si pela geração prevista de cada um (nunca média simples) — só
  // meses inteiramente cobertos.
  const mesesCobertos = mesesInteiramenteCobertos(inicio, fim);
  const previsoes = mesesCobertos.length
    ? await prisma.previsaoMensal.findMany({
        where: { usinaId: usina.id, ativo: true, OR: mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes })) },
        select: { ano: true, mes: true, geracaoPrevistaKwh: true, prPrevistoPct: true },
      })
    : [];
  const comPrevisao = previsoes.filter((p) => p.prPrevistoPct !== null && p.geracaoPrevistaKwh !== null);
  const geracaoPrevistaTotal = comPrevisao.reduce((s, p) => s + p.geracaoPrevistaKwh!, 0);
  const prEsperadoPct =
    comPrevisao.length && geracaoPrevistaTotal > 0
      ? Number((comPrevisao.reduce((s, p) => s + p.prPrevistoPct! * p.geracaoPrevistaKwh!, 0) / geracaoPrevistaTotal).toFixed(4))
      : null;

  const aderenciaPct =
    resultadoUsina.agregado.prPct !== null && prEsperadoPct !== null && prEsperadoPct > 0
      ? Number(((100 * resultadoUsina.agregado.prPct) / prEsperadoPct).toFixed(4))
      : null;

  // PR previsto por dia (referência no gráfico, linha tracejada): o PR Mensal já é uma razão (%),
  // então o mesmo valor do mês vale para todo dia dele — sem dividir por dias, diferente de geração
  // e irradiação (que são totais acumulados no mês).
  const prPrevistoPorMes = new Map(previsoes.filter((p) => p.prPrevistoPct !== null).map((p) => [`${p.ano}-${String(p.mes).padStart(2, "0")}`, p.prPrevistoPct!]));
  const prRealizadoPorDia = new Map(resultadoUsina.porDia.map((d) => [d.data, d.prPct]));
  const graficoDiario: { data: string; prPct: number | null; prPrevistoPct: number | null }[] = [];
  for (const cursor = new Date(inicio); cursor <= fim; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const chave = cursor.toISOString().slice(0, 10);
    graficoDiario.push({
      data: chave,
      prPct: prRealizadoPorDia.get(chave) ?? null,
      prPrevistoPct: prPrevistoPorMes.get(chave.slice(0, 7)) ?? null,
    });
  }

  // Tabela por SKID: PR diário usando a potência e a irradiação (própria, com fallback "geral")
  // de cada SKID.
  const tabelaPorSkid = await Promise.all(
    skids.map(async (skid) => {
      const [irradiacaoSkid, geracaoSkid] = await Promise.all([
        irradiacaoRepresentativaPorDia(usina.id, inicio, fim, skid.id),
        geracaoPorDia(usina.id, inicio, fim, { skidId: skid.id }),
      ]);
      const resultado = calcularPrDiarioPareado(geracaoSkid, irradiacaoSkid, skid.potenciaFvKwp);
      return { skidId: skid.id, nome: skid.nome, porDia: resultado.porDia, prAgregadoPct: resultado.agregado.prPct };
    })
  );

  const ultimoProcessamento = await obterUltimoProcessamento(usina.id, ABA);

  res.json({
    usina: { id: usina.id, nome: usina.nome, potenciaDcKwp: usina.potenciaDcKwp },
    periodo: { inicio, fim },
    metodo: "PR Simples",
    kpis: {
      prRealizadoPct: resultadoUsina.agregado.prPct,
      prEsperadoPct,
      aderenciaPct,
      diasComDadosPareados: resultadoUsina.agregado.dias,
      mesesComMetaPr: comPrevisao.length,
      mesesNoPeriodo: mesesCobertos.length,
    },
    graficoDiario,
    skids,
    tabelaPorSkid,
    ultimoProcessamento,
  });
});

router.post("/:usinaId/pr/reprocessar", exigirPermissao("lancamentos", "reprocessar"), async (req, res) => {
  const registro = await registrarProcessamento(req.params.usinaId, ABA, req.usuario!.id);
  res.json({ processadoEm: registro.processadoEm });
});

export default router;
