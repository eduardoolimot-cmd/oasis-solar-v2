import { Router } from "express";
import { calcularAderencia } from "../../lib/indicadores";
import { mesesInteiramenteCobertos } from "../../lib/mesesCobertos";
import { obterUltimoProcessamento, registrarProcessamento } from "../../lib/processamento";
import { prisma } from "../../lib/prisma";
import { irradiacaoRepresentativaPorDia } from "../../lib/seriesDiarias";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);
const ABA = "irradiacao";

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

router.get("/:usinaId/irradiacao", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const porDia = await irradiacaoRepresentativaPorDia(usina.id, inicio, fim);
  const diasComDado = [...porDia.entries()].map(([data, irradiacaoKwhM2]) => ({ data, irradiacaoKwhM2 }));
  const irradiacaoRealizadaKwhM2 = diasComDado.length ? diasComDado.reduce((s, d) => s + d.irradiacaoKwhM2, 0) : null;

  const mesesCobertos = mesesInteiramenteCobertos(inicio, fim);
  const previsoes = mesesCobertos.length
    ? await prisma.previsaoMensal.findMany({
        where: { usinaId: usina.id, ativo: true, OR: mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes })) },
        select: { ano: true, mes: true, irradiacaoPrevistaKwhM2: true },
      })
    : [];
  const comPrevisao = previsoes.filter((p) => p.irradiacaoPrevistaKwhM2 !== null);
  const irradiacaoPrevistaKwhM2 = comPrevisao.length ? comPrevisao.reduce((s, p) => s + p.irradiacaoPrevistaKwhM2!, 0) : null;

  // Irradiação prevista por dia (referência no gráfico, linha tracejada): meta mensal dividida
  // pelos dias do mês, só para meses inteiramente cobertos — mesmo critério da geração prevista.
  const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const irradiacaoPrevistaPorDiaDoMes = new Map(
    comPrevisao.map((p) => [`${p.ano}-${String(p.mes).padStart(2, "0")}`, p.irradiacaoPrevistaKwhM2! / diasNoMes(p.ano, p.mes)])
  );
  const irradiacaoRealizadaPorDia = new Map(diasComDado.map((d) => [d.data, d.irradiacaoKwhM2]));
  const graficoDiario: { data: string; irradiacaoKwhM2: number | null; irradiacaoPrevistaKwhM2: number | null }[] = [];
  for (const cursor = new Date(inicio); cursor <= fim; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const chave = cursor.toISOString().slice(0, 10);
    graficoDiario.push({
      data: chave,
      irradiacaoKwhM2: irradiacaoRealizadaPorDia.get(chave) ?? null,
      irradiacaoPrevistaKwhM2: irradiacaoPrevistaPorDiaDoMes.get(chave.slice(0, 7)) ?? null,
    });
  }

  const ultimoProcessamento = await obterUltimoProcessamento(usina.id, ABA);

  res.json({
    usina: { id: usina.id, nome: usina.nome, planoIrradiacao: usina.planoIrradiacao },
    periodo: { inicio, fim },
    kpis: {
      irradiacaoRealizadaKwhM2,
      irradiacaoPrevistaKwhM2,
      aderenciaPct: calcularAderencia(irradiacaoRealizadaKwhM2, irradiacaoPrevistaKwhM2),
      mesesComMeta: comPrevisao.length,
      mesesNoPeriodo: mesesCobertos.length,
    },
    graficoDiario,
    ultimoProcessamento,
  });
});

router.post("/:usinaId/irradiacao/reprocessar", exigirPermissao("lancamentos", "reprocessar"), async (req, res) => {
  const registro = await registrarProcessamento(req.params.usinaId, ABA, req.usuario!.id);
  res.json({ processadoEm: registro.processadoEm });
});

export default router;
