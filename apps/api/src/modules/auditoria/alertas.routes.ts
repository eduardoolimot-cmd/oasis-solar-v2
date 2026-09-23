import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { autenticar, exigirAdmin } from "../../middleware/auth";
import { usinasAutorizadas } from "../../middleware/permissao";

// Notificações (evolução, Fase 9) — alertas computados ao vivo a partir do estado atual, nunca
// persistidos: não há "central de notificações" com estado de lida/não lida nesta fase, só uma
// leitura direta das condições que já existem no sistema (estoque abaixo do mínimo, OS vencida,
// preventiva vencida, parada prolongada). Escopo de usinas segue a mesma permissão "notificacoes"
// usada pelo histórico/auditoria.

const router = Router();
router.use(autenticar, exigirAdmin);

const HORAS_PARADA_PROLONGADA = 24;

export interface Alerta {
  tipo: "ESTOQUE_BAIXO" | "OS_VENCIDA" | "PREVENTIVA_VENCIDA" | "PARADA_PROLONGADA";
  severidade: "ALTA" | "MEDIA";
  usinaId: string;
  usinaNome: string;
  mensagem: string;
  referenciaId: string;
  data: string;
}

router.get("/alertas", async (req, res) => {
  const permitidas = await usinasAutorizadas(req.usuario!, "notificacoes", "visualizar");
  const filtroUsina = permitidas ? { usinaId: { in: permitidas } } : {};
  const usinas = await prisma.usina.findMany({
    where: permitidas ? { id: { in: permitidas } } : undefined,
    select: { id: true, nome: true },
  });
  const nomePorUsina = new Map(usinas.map((u) => [u.id, u.nome]));
  const agora = new Date();
  const alertas: Alerta[] = [];

  // Estoque abaixo do mínimo — só itens com estoqueMinimo cadastrado (ausência de mínimo não é
  // presumida como "sem alerta possível", é simplesmente um item sem esse controle configurado).
  const saldosBaixos = await prisma.estoqueUsinaItem.findMany({
    where: { ...filtroUsina, item: { estoqueMinimo: { not: null } } },
    include: { item: { select: { nome: true, estoqueMinimo: true, unidadeMedida: true } } },
  });
  for (const s of saldosBaixos) {
    if (s.item.estoqueMinimo !== null && s.saldoQuantidade < s.item.estoqueMinimo) {
      alertas.push({
        tipo: "ESTOQUE_BAIXO",
        severidade: "MEDIA",
        usinaId: s.usinaId,
        usinaNome: nomePorUsina.get(s.usinaId) ?? s.usinaId,
        mensagem: `${s.item.nome}: saldo ${s.saldoQuantidade} ${s.item.unidadeMedida} abaixo do mínimo (${s.item.estoqueMinimo} ${s.item.unidadeMedida})`,
        referenciaId: s.id,
        data: s.atualizadoEm.toISOString(),
      });
    }
  }

  // Ordens de Serviço vencidas — abertas/em andamento com data prevista já passada.
  const osVencidas = await prisma.ordemServico.findMany({
    where: { ...filtroUsina, status: { in: ["ABERTA", "EM_ANDAMENTO"] }, dataPrevista: { lt: agora } },
  });
  for (const os of osVencidas) {
    alertas.push({
      tipo: "OS_VENCIDA",
      severidade: "ALTA",
      usinaId: os.usinaId,
      usinaNome: nomePorUsina.get(os.usinaId) ?? os.usinaId,
      mensagem: `OS "${os.titulo}" com data prevista vencida (${os.dataPrevista!.toISOString().slice(0, 10)})`,
      referenciaId: os.id,
      data: os.dataPrevista!.toISOString(),
    });
  }

  // Planos preventivos vencidos — ativos com próxima geração já passada (ainda não gerou a OS).
  const preventivasVencidas = await prisma.planoPreventivo.findMany({
    where: { ...filtroUsina, ativo: true, proximaGeracao: { lt: agora } },
  });
  for (const p of preventivasVencidas) {
    alertas.push({
      tipo: "PREVENTIVA_VENCIDA",
      severidade: "MEDIA",
      usinaId: p.usinaId,
      usinaNome: nomePorUsina.get(p.usinaId) ?? p.usinaId,
      mensagem: `Plano preventivo "${p.titulo}" com geração de OS pendente desde ${p.proximaGeracao.toISOString().slice(0, 10)}`,
      referenciaId: p.id,
      data: p.proximaGeracao.toISOString(),
    });
  }

  // Paradas prolongadas — eventos operacionais em andamento (sem fim) há mais de 24h.
  const limiteParada = new Date(agora.getTime() - HORAS_PARADA_PROLONGADA * 3_600_000);
  const paradasEmAndamento = await prisma.eventoOperacional.findMany({
    where: { ...filtroUsina, fim: null, inicio: { lt: limiteParada } },
  });
  for (const e of paradasEmAndamento) {
    const horas = Math.round((agora.getTime() - e.inicio.getTime()) / 3_600_000);
    alertas.push({
      tipo: "PARADA_PROLONGADA",
      severidade: "ALTA",
      usinaId: e.usinaId,
      usinaNome: nomePorUsina.get(e.usinaId) ?? e.usinaId,
      mensagem: `Parada de ${e.tipo === "GERACAO" ? "geração" : "comunicação"} em andamento há ${horas}h${e.motivo ? ` — ${e.motivo}` : ""}`,
      referenciaId: e.id,
      data: e.inicio.toISOString(),
    });
  }

  alertas.sort((a, b) => (a.severidade === b.severidade ? b.data.localeCompare(a.data) : a.severidade === "ALTA" ? -1 : 1));

  res.json({ alertas, total: alertas.length });
});

export default router;
