import { Router } from "express";
import { resumirDegradacao } from "../../lib/degradacao";
import { calcularGeracaoUsina, diasDoPeriodo } from "../../lib/geracaoUsina";
import { calcularAderencia } from "../../lib/indicadores";
import { obterUltimoProcessamento, registrarProcessamento } from "../../lib/processamento";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);
const ABA = "geracao_bruta";

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

router.get("/:usinaId/geracao-bruta", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio, fim } = periodoDaQuery(req.query);
  if (inicio > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  const skids = await prisma.skid.findMany({ where: { usinaId: usina.id, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });

  // Realizado, metas P50/P90 (meses inteiros, com degradação) e geração prevista PVsyst diária —
  // cálculo compartilhado com a visão consolidada "Todas as usinas" (lib/geracaoUsina.ts).
  const g = await calcularGeracaoUsina(usina.id, inicio, fim);
  const { energiaBrutaKwh, p50Kwh, p90Kwh, curvaDegradacao, mesesDoPeriodo, mesesCobertos, geracaoPrevistaPeriodoKwh } = g;

  // Gráfico diário: energia realizada (colunas) + irradiação realizada (linha), sem inventar uma
  // curva de irradiação prevista diária a partir da meta apenas mensal.
  const irradiacaoDiariaRaw = await prisma.lancamentoIrradiacaoDiaria.findMany({
    where: { usinaId: usina.id, skidId: null, data: { gte: inicio, lte: fim } },
    select: { data: true, irradiacaoKwhM2: true },
  });
  const irradiacaoPorDia = new Map(irradiacaoDiariaRaw.map((l) => [l.data.toISOString().slice(0, 10), l.irradiacaoKwhM2]));

  // Percorre todo o intervalo (não só os dias com lançamento) para que a linha de referência de
  // geração prevista fique contínua mesmo em dias sem medição ainda lançada.
  const graficoDiario = diasDoPeriodo(inicio, fim).map((chave) => ({
    data: chave,
    energiaKwh: g.energiaPorDia.get(chave) ?? null,
    irradiacaoRealizadaKwhM2: irradiacaoPorDia.get(chave) ?? null,
    geracaoPrevistaKwh: g.geracaoPrevistaPorDia.get(chave) ?? null,
  }));

  // Irradiação realizada do período (mesma regra da aba Irradiação: soma só os dias com dado, sem
  // inventar os que faltam).
  const diasComIrradiacao = graficoDiario.filter((d) => d.irradiacaoRealizadaKwhM2 !== null);
  const irradiacaoRealizadaKwhM2 = diasComIrradiacao.length ? diasComIrradiacao.reduce((s, d) => s + d.irradiacaoRealizadaKwhM2!, 0) : null;

  // Tabela diária por SKID (Σ Inversores + cada SKID).
  const geracaoPorSkidDiaRaw = await prisma.lancamentoGeracaoDiaria.groupBy({
    by: ["data", "skidId"],
    where: { usinaId: usina.id, inversorId: { not: null }, data: { gte: inicio, lte: fim } },
    _sum: { energiaKwh: true },
  });
  const tabelaPorData = new Map<string, { data: string; somaInversoresKwh: number; porSkid: Record<string, number> }>();
  for (const linha of geracaoPorSkidDiaRaw) {
    const chave = linha.data.toISOString().slice(0, 10);
    if (!tabelaPorData.has(chave)) tabelaPorData.set(chave, { data: chave, somaInversoresKwh: 0, porSkid: {} });
    const entrada = tabelaPorData.get(chave)!;
    const valor = linha._sum.energiaKwh ?? 0;
    entrada.somaInversoresKwh += valor;
    if (linha.skidId) {
      const nomeSkid = skids.find((s) => s.id === linha.skidId)?.nome ?? linha.skidId;
      entrada.porSkid[nomeSkid] = (entrada.porSkid[nomeSkid] ?? 0) + valor;
    }
  }
  const tabelaDiaria = [...tabelaPorData.values()].sort((a, b) => a.data.localeCompare(b.data));

  const ultimoProcessamento = await obterUltimoProcessamento(usina.id, ABA);

  res.json({
    usina: { id: usina.id, nome: usina.nome, municipio: usina.municipio, uf: usina.uf, potenciaDcKwp: usina.potenciaDcKwp },
    periodo: { inicio, fim },
    kpis: {
      energiaBrutaKwh,
      irradiacaoRealizadaKwhM2,
      geracaoPrevistaKwh: geracaoPrevistaPeriodoKwh,
      degradacao: resumirDegradacao(curvaDegradacao, mesesDoPeriodo),
      p50Kwh,
      p90Kwh,
      aderenciaP50Pct: calcularAderencia(energiaBrutaKwh, p50Kwh),
      aderenciaP90Pct: calcularAderencia(energiaBrutaKwh, p90Kwh),
      mesesNoPeriodo: mesesCobertos.length,
      mesesComMetaP50: g.mesesComMetaP50,
    },
    graficoDiario,
    tabelaDiaria,
    skids,
    ultimoProcessamento,
  });
});

// Idempotente: recalcula com os dados já existentes (tudo já é calculado em tempo real) e só
// atualiza o carimbo de "último processamento" — nunca coleta dados novos nem duplica registros.
router.post("/:usinaId/geracao-bruta/reprocessar", exigirPermissao("lancamentos", "reprocessar"), async (req, res) => {
  const registro = await registrarProcessamento(req.params.usinaId, ABA, req.usuario!.id);
  res.json({ processadoEm: registro.processadoEm });
});

export default router;
