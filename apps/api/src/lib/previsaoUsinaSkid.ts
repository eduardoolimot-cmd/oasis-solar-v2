import { registrarAuditoria } from "./auditoria";
import { prisma } from "./prisma";

// Previsão mensal da usina (PrevisaoMensal) a partir dos "Dados mensais por SKID (PVsyst)" do
// Cadastro de Usinas — usada pela rota que salva os dados por SKID e pelo script de recálculo
// (prisma/recalcular_previsao_usina_skid.ts).
//
//   Geração prevista = soma do E_Grid de todos os SKIDs ativos. Soma de energia não depende de
//     potência: basta todos os SKIDs ativos terem valor no mês.
//   Irradiação / PR = com um único SKID, os valores dele; com vários, média ponderada pela potência
//     FV (nunca média simples) — exige potência cadastrada em todos. Sem isso: não calculável, e o
//     valor anterior é preservado.
//   Mês em que algum SKID ativo não tem valor: preserva o valor anterior (dado ausente ≠ zero).
//   P50/P90 e metas de disponibilidade vêm de "Metas mensais" e são copiados da versão anterior.

type LinhaNova = {
  usinaId: string;
  ano: number;
  mes: number;
  versao: number;
  geracaoPrevistaKwh: number | null;
  irradiacaoPrevistaKwhM2: number | null;
  prPrevistoPct: number | null;
  geracaoP50Kwh: number | null;
  geracaoP90Kwh: number | null;
  dispGeracaoMetaPct: number | null;
  dispComunicacaoMetaPct: number | null;
  documentoOrigem: string;
  responsavel: null;
};

export async function calcularPrevisaoUsinaPorSkid(usinaId: string, ano: number) {
  const skids = await prisma.skid.findMany({ where: { usinaId, ativo: true }, select: { id: true, potenciaFvKwp: true } });
  const linhasPorSkid = await prisma.previsaoMensalSkid.findMany({ where: { usinaId, ano, ativo: true } });
  const anteriores = await prisma.previsaoMensal.findMany({ where: { usinaId, ano, ativo: true } });
  const versaoAnterior = anteriores[0]?.versao ?? 0;

  const linhas: LinhaNova[] = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const anteriorMes = anteriores.find((l) => l.mes === mes);
    const doMes = skids.map((skid) => ({ skid, linha: linhasPorSkid.find((l) => l.skidId === skid.id && l.mes === mes) }));

    const energiaCompleta = doMes.length > 0 && doMes.every((x) => x.linha?.geracaoEGridKwh != null);
    const geracao = energiaCompleta ? doMes.reduce((s, x) => s + x.linha!.geracaoEGridKwh!, 0) : null;

    const ponderar = (campo: "irradiacaoGlobEffKwhM2" | "prPct"): number | null => {
      if (!energiaCompleta || !doMes.every((x) => x.linha?.[campo] != null)) return null;
      if (doMes.length === 1) return doMes[0].linha![campo]!;
      if (!doMes.every((x) => x.skid.potenciaFvKwp != null && x.skid.potenciaFvKwp > 0)) return null;
      const potenciaTotal = doMes.reduce((s, x) => s + x.skid.potenciaFvKwp!, 0);
      return doMes.reduce((s, x) => s + x.linha![campo]! * x.skid.potenciaFvKwp!, 0) / potenciaTotal;
    };
    const irradiacao = ponderar("irradiacaoGlobEffKwhM2");
    const pr = ponderar("prPct");

    return {
      usinaId,
      ano,
      mes,
      versao: versaoAnterior + 1,
      geracaoPrevistaKwh: geracao ?? anteriorMes?.geracaoPrevistaKwh ?? null,
      irradiacaoPrevistaKwhM2: irradiacao ?? anteriorMes?.irradiacaoPrevistaKwhM2 ?? null,
      prPrevistoPct: pr ?? anteriorMes?.prPrevistoPct ?? null,
      geracaoP50Kwh: anteriorMes?.geracaoP50Kwh ?? null,
      geracaoP90Kwh: anteriorMes?.geracaoP90Kwh ?? null,
      dispGeracaoMetaPct: anteriorMes?.dispGeracaoMetaPct ?? null,
      dispComunicacaoMetaPct: anteriorMes?.dispComunicacaoMetaPct ?? null,
      documentoOrigem: "Cadastro de Usinas — dados mensais por SKID",
      responsavel: null,
    };
  });

  const igual = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6);
  const campos = ["geracaoPrevistaKwh", "irradiacaoPrevistaKwhM2", "prPrevistoPct"] as const;
  const mudancas = linhas.flatMap((l) => {
    const ant = anteriores.find((a) => a.mes === l.mes);
    return campos.filter((c) => !igual(ant?.[c] ?? null, l[c])).map((c) => ({ mes: l.mes, campo: c, anterior: ant?.[c] ?? null, novo: l[c] }));
  });

  return { linhas, versaoAnterior, mudancas };
}

/// Grava uma nova versão de PrevisaoMensal (a anterior fica inativa, nunca sobrescrita).
export async function recalcularPrevisaoUsina(usinaId: string, ano: number, usuarioId: string | null, motivo: string) {
  const { linhas, versaoAnterior } = await calcularPrevisaoUsinaPorSkid(usinaId, ano);
  const novaVersao = versaoAnterior + 1;

  await prisma.$transaction([
    prisma.previsaoMensal.updateMany({ where: { usinaId, ano, ativo: true }, data: { ativo: false } }),
    prisma.previsaoMensal.createMany({ data: linhas }),
  ]);

  await registrarAuditoria({
    usuarioId,
    usinaId,
    modulo: "cadastro_usinas",
    entidade: "PrevisaoMensal",
    entidadeId: usinaId,
    acao: "EDICAO",
    justificativa: `${motivo} — nova versão ${novaVersao} (ano ${ano})`,
    valorAnterior: versaoAnterior || null,
    valorNovo: novaVersao,
  });
  return novaVersao;
}
