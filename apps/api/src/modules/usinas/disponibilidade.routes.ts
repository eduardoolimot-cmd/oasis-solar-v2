import { Router } from "express";
import { calcularDisponibilidadePct, calcularMtbfHoras, calcularMttrHoras } from "../../lib/disponibilidade";
import { obterUltimoProcessamento, registrarProcessamento } from "../../lib/processamento";
import { prisma } from "../../lib/prisma";
import { autenticar } from "../../middleware/auth";
import { exigirPermissao } from "../../middleware/permissao";

const router = Router();
router.use(autenticar);
const ABA = "disponibilidade";

function periodoDaQuery(query: Record<string, unknown>): { inicio: Date; fim: Date } {
  const hoje = new Date();
  const fim = query.fim ? new Date(String(query.fim)) : hoje;
  const inicio = query.inicio ? new Date(String(query.inicio)) : new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1));
  return { inicio, fim };
}

/// Disponibilidade (geração e comunicação), MTTR e MTBF a partir de eventos operacionais
/// (Manutenção, Fase 6). "Ausência de falhas" é diferente de "sem eventos cadastrados": só
/// calculamos um percentual quando já existe pelo menos um evento histórico daquele tipo para a
/// usina — nunca 100% nem 0% inventados por falta de monitoramento (ver docs/DECISOES_PLACEHOLDER.md).
router.get("/:usinaId/disponibilidade", exigirPermissao("lancamentos", "visualizar"), async (req, res) => {
  const usina = await prisma.usina.findUnique({ where: { id: req.params.usinaId } });
  if (!usina) return res.status(404).json({ erro: "Usina não encontrada." });

  const { inicio: inicioConsulta, fim } = periodoDaQuery(req.query);
  if (inicioConsulta > fim) return res.status(400).json({ erro: "Data de início posterior à data de fim." });

  // "fim" chega como data pura (sem hora, ex.: 2026-08-31T00:00Z) — mesma convenção de
  // horasDoIntervalo (lib/calculos.ts): o dia de fim é inteiro, então a janela contínua para
  // cálculo de duração vai até o início do dia seguinte, nunca até a meia-noite do próprio dia de
  // fim (o que descontaria ~24h da janela e distorceria disponibilidade/MTBF).
  const fimInclusivo = new Date(fim.getTime() + 86_400_000);

  // Janela elegível: interseção entre o período consultado e o início de operação da usina — uma
  // parada não pode contar como indisponibilidade antes de a usina existir operacionalmente.
  const inicioOperacao = usina.inicioOperacao;
  const inicio = inicioOperacao && inicioOperacao > inicioConsulta ? inicioOperacao : inicioConsulta;
  const janelaValida = inicio < fimInclusivo;

  const [totalGeracaoHistorico, totalComunicacaoHistorico, eventosNaJanela] = await Promise.all([
    prisma.eventoOperacional.count({ where: { usinaId: usina.id, tipo: "GERACAO" } }),
    prisma.eventoOperacional.count({ where: { usinaId: usina.id, tipo: "COMUNICACAO" } }),
    janelaValida
      ? prisma.eventoOperacional.findMany({
          where: { usinaId: usina.id, inicio: { lt: fimInclusivo }, OR: [{ fim: null }, { fim: { gte: inicio } }] },
          include: { skid: { select: { id: true, nome: true } } },
          orderBy: { inicio: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const geracaoNaJanela = eventosNaJanela.filter((e) => e.tipo === "GERACAO");
  const comunicacaoNaJanela = eventosNaJanela.filter((e) => e.tipo === "COMUNICACAO");
  const geracaoEncerradosNaJanela = geracaoNaJanela.filter((e): e is typeof e & { fim: Date } => e.fim !== null);

  const disponibilidadeGeracaoPct =
    janelaValida && totalGeracaoHistorico > 0 ? calcularDisponibilidadePct(geracaoNaJanela, inicio, fimInclusivo) : null;
  const disponibilidadeComunicacaoPct =
    janelaValida && totalComunicacaoHistorico > 0 ? calcularDisponibilidadePct(comunicacaoNaJanela, inicio, fimInclusivo) : null;
  const mttrHoras = janelaValida ? calcularMttrHoras(geracaoEncerradosNaJanela) : null;
  const mtbfHoras = janelaValida ? calcularMtbfHoras(geracaoEncerradosNaJanela, inicio, fimInclusivo) : null;

  const ultimoProcessamento = await obterUltimoProcessamento(usina.id, ABA);

  res.json({
    usina: { id: usina.id, nome: usina.nome },
    periodo: { inicio, fim },
    janelaAjustadaPorInicioOperacao: inicioOperacao !== null && inicio.getTime() !== inicioConsulta.getTime(),
    kpis: {
      disponibilidadeGeracaoPct,
      disponibilidadeComunicacaoPct,
      mttrHoras,
      mtbfHoras,
      numeroDeParadas: geracaoNaJanela.length,
    },
    eventos: eventosNaJanela,
    avisoSemHistorico:
      totalGeracaoHistorico === 0 && totalComunicacaoHistorico === 0
        ? "Nenhum evento operacional cadastrado ainda para esta usina — cadastre paradas no módulo Manutenção para calcular disponibilidade, MTTR e MTBF."
        : null,
    ultimoProcessamento,
  });
});

// Idempotente: recalcula com os eventos já existentes (nada é coletado automaticamente) e só
// atualiza o carimbo de "último processamento".
router.post("/:usinaId/disponibilidade/reprocessar", exigirPermissao("lancamentos", "reprocessar"), async (req, res) => {
  const registro = await registrarProcessamento(req.params.usinaId, ABA, req.usuario!.id);
  res.json({ processadoEm: registro.processadoEm });
});

export default router;
