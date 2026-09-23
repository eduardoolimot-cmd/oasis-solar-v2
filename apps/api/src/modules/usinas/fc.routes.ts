import { Router } from "express";
import { carregarCurvaDegradacao, fatorDegradacao, fatorDegradacaoAnual, mesesTocadosPeloPeriodo, resumirDegradacao } from "../../lib/degradacao";
import { calcularAderencia } from "../../lib/indicadores";
import { horasDoIntervalo, horasDoMes } from "../../lib/calculos";
import { mesesInteiramenteCobertos } from "../../lib/mesesCobertos";
import { obterUltimoProcessamento, registrarProcessamento } from "../../lib/processamento";
import { prisma } from "../../lib/prisma";
import { geracaoPorDia } from "../../lib/seriesDiarias";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);
const ABA = "fc";

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

router.get("/:usinaId/fc", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  // Base AC/DC identificada explicitamente — nunca alternada implicitamente.
  const baseUsada = usina.baseFcPadrao === "AC" && usina.potenciaAcKw ? "AC" : "DC";
  const potenciaReferenciaKw = baseUsada === "AC" ? usina.potenciaAcKw! : usina.potenciaDcKwp;

  const geracaoUsina = await geracaoPorDia(usina.id, inicio, fim);
  const energiaRealizadaKwh = [...geracaoUsina.values()].reduce((s, v) => s + v, 0) || null;
  const horasPeriodo = horasDoIntervalo(inicio, fim);
  const fcAferidoPct = energiaRealizadaKwh !== null ? Number(((100 * energiaRealizadaKwh) / (potenciaReferenciaKw * horasPeriodo)).toFixed(4)) : null;

  // Meta de FC — soma dos denominadores potência×horas por mês inteiramente coberto (nunca média
  // simples nem soma direta de percentuais de FC).
  const mesesCobertos = mesesInteiramenteCobertos(inicio, fim);
  const previsoes = mesesCobertos.length
    ? await prisma.previsaoMensal.findMany({
        where: { usinaId: usina.id, ativo: true, OR: mesesCobertos.map((m) => ({ ano: m.ano, mes: m.mes })) },
        select: { ano: true, mes: true, geracaoP50Kwh: true },
      })
    : [];
  const comMeta = previsoes.filter((p) => p.geracaoP50Kwh !== null);
  const denominadorMetaKwh = comMeta.reduce((s, p) => s + potenciaReferenciaKw * horasDoMes(p.ano, p.mes), 0);
  // Meta de FC parte do P50 já ajustado pela degradação (ano de operação de cada mês; lib/degradacao.ts).
  const curvaDegradacao = await carregarCurvaDegradacao(usina.id);
  const numeradorMetaKwh = comMeta.reduce((s, p) => s + p.geracaoP50Kwh! * fatorDegradacao(curvaDegradacao, p.ano, p.mes), 0);
  let fcMetaPct = comMeta.length && denominadorMetaKwh > 0 ? Number(((100 * numeradorMetaKwh) / denominadorMetaKwh).toFixed(4)) : null;

  // Recorte é um ano civil inteiro sem meta mensal (estudo só forneceu o cenário anual) — usar o
  // cenário anual, mesma regra aplicada em Geração Bruta.
  const anoCivilInteiro =
    inicio.getUTCMonth() === 0 && inicio.getUTCDate() === 1 && fim.getUTCMonth() === 11 && fim.getUTCDate() === 31 && inicio.getUTCFullYear() === fim.getUTCFullYear();
  if (anoCivilInteiro && fcMetaPct === null) {
    const anual = await prisma.previsaoAnual.findFirst({ where: { usinaId: usina.id, ano: inicio.getUTCFullYear(), ativo: true } });
    if (anual?.geracaoP50Kwh) {
      fcMetaPct = Number(((100 * anual.geracaoP50Kwh * fatorDegradacaoAnual(curvaDegradacao, inicio.getUTCFullYear())) / (potenciaReferenciaKw * horasPeriodo)).toFixed(4));
    }
  }

  const graficoDiario = [...geracaoUsina.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, energiaKwh]) => ({
      data,
      fcPct: Number(((100 * energiaKwh) / (potenciaReferenciaKw * 24)).toFixed(4)),
    }));

  const skids = await prisma.skid.findMany({ where: { usinaId: usina.id, ativo: true }, select: { id: true, nome: true, potenciaFvKwp: true }, orderBy: { nome: "asc" } });
  const graficoPorSkid = await Promise.all(
    skids.map(async (skid) => {
      const geracaoSkid = await geracaoPorDia(usina.id, inicio, fim, { skidId: skid.id });
      const totalSkidKwh = [...geracaoSkid.values()].reduce((s, v) => s + v, 0);
      const fcSkidPct = skid.potenciaFvKwp ? Number(((100 * totalSkidKwh) / (skid.potenciaFvKwp * horasPeriodo)).toFixed(4)) : null;
      return { skidId: skid.id, nome: skid.nome, fcPct: fcSkidPct };
    })
  );

  const ultimoProcessamento = await obterUltimoProcessamento(usina.id, ABA);

  res.json({
    usina: { id: usina.id, nome: usina.nome, potenciaDcKwp: usina.potenciaDcKwp, potenciaAcKw: usina.potenciaAcKw },
    periodo: { inicio, fim },
    baseUsada,
    kpis: {
      fcAferidoPct,
      fcMetaPct,
      aderenciaPct: calcularAderencia(fcAferidoPct, fcMetaPct),
      degradacao: resumirDegradacao(curvaDegradacao, mesesTocadosPeloPeriodo(inicio, fim)),
      mesesComMeta: comMeta.length,
      mesesNoPeriodo: mesesCobertos.length,
    },
    graficoDiario,
    graficoPorSkid,
    ultimoProcessamento,
  });
});

router.post("/:usinaId/fc/reprocessar", exigirPermissao("lancamentos", "reprocessar"), async (req, res) => {
  const registro = await registrarProcessamento(req.params.usinaId, ABA, req.usuario!.id);
  res.json({ processadoEm: registro.processadoEm });
});

export default router;
