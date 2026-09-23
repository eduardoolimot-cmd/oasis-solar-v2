// Atualização dos dados mensais por SKID (Geração E_Grid, Irradiação GlobEff, PR) a partir de 3
// planilhas novas do cliente — mesma estrutura em todas: "Nome" (usina), "SKID" ("SKID N" ou "-"
// para usinas sem subdivisão), Jan..Dez. Script idempotente: pode ser reexecutado (cada execução
// cria uma nova versão, nunca sobrescreve — mesmo esquema de preservação usado em toda a Fase 2+).
//
// Para usinas COM SKID: grava uma nova versão de PrevisaoMensalSkid por SKID, depois recalcula a
// previsão mensal da usina (PrevisaoMensal) a partir dessas linhas — soma de energia entre SKIDs,
// irradiação/PR ponderados por potência instalada, nunca média simples (mesma fórmula de
// src/modules/usinas/previsoesSkid.routes.ts). Um mês só é recalculado quando TODOS os SKIDs ativos
// (com potência cadastrada) têm dado nele; senão preserva o valor anterior.
//
// Para usinas SEM SKID (linha "-"): grava direto em PrevisaoMensal a partir da única linha — não há
// múltiplos valores para combinar, então o PR da planilha é usado diretamente (não recalculado a
// partir de potência×irradiação), diferente da agregação entre SKIDs.

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ARQ_GERACAO = "C:\\Users\\Eduardo Motta\\Desktop\\Dados de Geração\\Dados de Geração_Mensal.xlsx";
const ARQ_IRRADIACAO = "C:\\Users\\Eduardo Motta\\Desktop\\Dados de Geração\\Irradiação Mensal.xlsx";
const ARQ_PR = "C:\\Users\\Eduardo Motta\\Desktop\\Dados de Geração\\PR Peformace Ratio.xlsx";
const ANO = 2026;
const DOCUMENTO_ORIGEM = "Atualização 2026-09-18 — Dados de Geração_Mensal.xlsx / Irradiação Mensal.xlsx / PR Peformace Ratio.xlsx";

interface LinhaPlanilha {
  usina: string;
  skid: string; // "SKID 1", "SKID 2", ... ou "-"
  valoresMes: number[]; // 12 valores, Jan..Dez
}

async function lerPlanilha(caminho: string): Promise<LinhaPlanilha[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(caminho);
  const planilha = workbook.worksheets[0];
  const linhas: LinhaPlanilha[] = [];
  for (let r = 2; r <= planilha.rowCount; r++) {
    const row = planilha.getRow(r);
    const usina = String(row.getCell(1).value ?? "").trim();
    const skid = String(row.getCell(2).value ?? "").trim();
    if (!usina) continue;
    const valoresMes: number[] = [];
    for (let c = 3; c <= 14; c++) {
      const v = row.getCell(c).value;
      valoresMes.push(typeof v === "number" ? v : Number(v) || 0);
    }
    linhas.push({ usina, skid, valoresMes });
  }
  return linhas;
}

async function main() {
  const [geracao, irradiacao, pr] = await Promise.all([lerPlanilha(ARQ_GERACAO), lerPlanilha(ARQ_IRRADIACAO), lerPlanilha(ARQ_PR)]);

  const chave = (usina: string, skid: string) => `${usina}|||${skid}`;
  const mapaIrradiacao = new Map(irradiacao.map((l) => [chave(l.usina, l.skid), l]));
  const mapaPr = new Map(pr.map((l) => [chave(l.usina, l.skid), l]));

  const usinas = await prisma.usina.findMany({
    include: { skids: { where: { ativo: true }, select: { id: true, nome: true, potenciaFvKwp: true } } },
    orderBy: { nome: "asc" },
  });

  let usinasAtualizadas = 0;
  let usinasSemCorrespondencia = 0;

  for (const usina of usinas) {
    const linhasGeracaoUsina = geracao.filter((l) => l.usina === usina.nome);
    if (linhasGeracaoUsina.length === 0) {
      console.log(`[SEM CORRESPONDÊNCIA] ${usina.nome} — nenhuma linha na planilha de Geração Mensal.`);
      usinasSemCorrespondencia++;
      continue;
    }

    if (usina.skids.length > 0) {
      // --- Usina com SKIDs: grava PrevisaoMensalSkid por SKID, depois agrega para a usina. ---
      let algumSkidGravado = false;

      for (const skid of usina.skids) {
        const linhaGeracao = linhasGeracaoUsina.find((l) => l.skid === skid.nome);
        if (!linhaGeracao) {
          console.log(`  [SEM CORRESPONDÊNCIA] ${usina.nome} / ${skid.nome} — não encontrado na planilha.`);
          continue;
        }
        const linhaIrradiacao = mapaIrradiacao.get(chave(usina.nome, skid.nome));
        const linhaPr = mapaPr.get(chave(usina.nome, skid.nome));

        const versaoAnterior = await prisma.previsaoMensalSkid.findFirst({
          where: { skidId: skid.id, ano: ANO },
          orderBy: { versao: "desc" },
          select: { versao: true },
        });
        const novaVersao = (versaoAnterior?.versao ?? 0) + 1;

        await prisma.$transaction(async (tx) => {
          await tx.previsaoMensalSkid.updateMany({ where: { skidId: skid.id, ano: ANO, ativo: true }, data: { ativo: false } });
          await tx.previsaoMensalSkid.createMany({
            data: Array.from({ length: 12 }, (_, i) => ({
              usinaId: usina.id,
              skidId: skid.id,
              ano: ANO,
              mes: i + 1,
              versao: novaVersao,
              geracaoEGridKwh: linhaGeracao.valoresMes[i] * 1000, // MWh (planilha) -> kWh
              irradiacaoGlobEffKwhM2: linhaIrradiacao ? linhaIrradiacao.valoresMes[i] : null,
              prPct: linhaPr ? linhaPr.valoresMes[i] * 100 : null,
              documentoOrigem: DOCUMENTO_ORIGEM,
            })),
          });
        });
        algumSkidGravado = true;
      }

      if (!algumSkidGravado) continue;

      // --- Agregação usina-level (mesma fórmula de previsoesSkid.routes.ts) ---
      const skidsComPotencia = usina.skids.filter((s) => s.potenciaFvKwp !== null && s.potenciaFvKwp > 0);
      const linhasPorSkid = await prisma.previsaoMensalSkid.findMany({ where: { usinaId: usina.id, ano: ANO, ativo: true } });
      const versaoAnteriorLinhas = await prisma.previsaoMensal.findMany({ where: { usinaId: usina.id, ano: ANO, ativo: true } });
      const versaoAnteriorUsina = versaoAnteriorLinhas[0]?.versao ?? 0;
      const novaVersaoUsina = versaoAnteriorUsina + 1;

      const dadosMensais = Array.from({ length: 12 }, (_, i) => {
        const mes = i + 1;
        const anteriorMes = versaoAnteriorLinhas.find((l) => l.mes === mes);

        const porSkid = usina.skids
          .map((skid) => ({ potenciaKwp: skid.potenciaFvKwp, linha: linhasPorSkid.find((l) => l.skidId === skid.id && l.mes === mes) }))
          .filter((x): x is { potenciaKwp: number; linha: (typeof linhasPorSkid)[number] } => x.potenciaKwp !== null && x.potenciaKwp > 0 && x.linha?.geracaoEGridKwh !== undefined && x.linha?.geracaoEGridKwh !== null);

        const coberturaCompleta = skidsComPotencia.length > 0 && porSkid.length === skidsComPotencia.length;
        const geracaoTotalKwh = coberturaCompleta ? porSkid.reduce((s, x) => s + x.linha.geracaoEGridKwh!, 0) : null;
        const potenciaTotal = porSkid.reduce((s, x) => s + x.potenciaKwp, 0);
        const irradiacaoPonderada =
          coberturaCompleta && potenciaTotal > 0 && porSkid.every((x) => x.linha.irradiacaoGlobEffKwhM2 !== null)
            ? porSkid.reduce((s, x) => s + (x.linha.irradiacaoGlobEffKwhM2 ?? 0) * x.potenciaKwp, 0) / potenciaTotal
            : null;
        const prPrevistoPct =
          coberturaCompleta && potenciaTotal > 0 && porSkid.every((x) => x.linha.prPct !== null)
            ? porSkid.reduce((s, x) => s + (x.linha.prPct ?? 0) * x.potenciaKwp, 0) / potenciaTotal
            : null;

        return {
          usinaId: usina.id,
          ano: ANO,
          mes,
          versao: novaVersaoUsina,
          geracaoPrevistaKwh: coberturaCompleta ? geracaoTotalKwh : anteriorMes?.geracaoPrevistaKwh ?? null,
          irradiacaoPrevistaKwhM2: coberturaCompleta ? irradiacaoPonderada : anteriorMes?.irradiacaoPrevistaKwhM2 ?? null,
          prPrevistoPct: coberturaCompleta ? prPrevistoPct : anteriorMes?.prPrevistoPct ?? null,
          geracaoP50Kwh: anteriorMes?.geracaoP50Kwh ?? null,
          geracaoP90Kwh: anteriorMes?.geracaoP90Kwh ?? null,
          dispGeracaoMetaPct: anteriorMes?.dispGeracaoMetaPct ?? null,
          dispComunicacaoMetaPct: anteriorMes?.dispComunicacaoMetaPct ?? null,
          documentoOrigem: DOCUMENTO_ORIGEM,
          responsavel: null,
        };
      });

      await prisma.previsaoMensal.updateMany({ where: { usinaId: usina.id, ano: ANO, ativo: true }, data: { ativo: false } });
      await prisma.previsaoMensal.createMany({ data: dadosMensais });

      const geracaoAnoKwh = dadosMensais.reduce((s, m) => s + (m.geracaoPrevistaKwh ?? 0), 0);
      console.log(`[OK] ${usina.nome}: ${usina.skids.length} SKID(s) atualizados; PrevisaoMensal versão ${novaVersaoUsina} (geração prevista ano ≈ ${geracaoAnoKwh.toFixed(0)} kWh)`);
      usinasAtualizadas++;
    } else {
      // --- Usina sem SKID: grava direto em PrevisaoMensal a partir da única linha ("-"). ---
      const linhaGeracao = linhasGeracaoUsina.find((l) => l.skid === "-") ?? linhasGeracaoUsina[0];
      const linhaIrradiacao = mapaIrradiacao.get(chave(usina.nome, linhaGeracao.skid));
      const linhaPr = mapaPr.get(chave(usina.nome, linhaGeracao.skid));

      const versaoAnteriorLinhas = await prisma.previsaoMensal.findMany({ where: { usinaId: usina.id, ano: ANO, ativo: true } });
      const versaoAnteriorUsina = versaoAnteriorLinhas[0]?.versao ?? 0;
      const novaVersaoUsina = versaoAnteriorUsina + 1;

      const dadosMensais = Array.from({ length: 12 }, (_, i) => {
        const anteriorMes = versaoAnteriorLinhas.find((l) => l.mes === i + 1);
        return {
          usinaId: usina.id,
          ano: ANO,
          mes: i + 1,
          versao: novaVersaoUsina,
          geracaoPrevistaKwh: linhaGeracao.valoresMes[i] * 1000,
          irradiacaoPrevistaKwhM2: linhaIrradiacao ? linhaIrradiacao.valoresMes[i] : null,
          prPrevistoPct: linhaPr ? linhaPr.valoresMes[i] * 100 : null,
          geracaoP50Kwh: anteriorMes?.geracaoP50Kwh ?? null,
          geracaoP90Kwh: anteriorMes?.geracaoP90Kwh ?? null,
          dispGeracaoMetaPct: anteriorMes?.dispGeracaoMetaPct ?? null,
          dispComunicacaoMetaPct: anteriorMes?.dispComunicacaoMetaPct ?? null,
          documentoOrigem: DOCUMENTO_ORIGEM,
          responsavel: null,
        };
      });

      await prisma.previsaoMensal.updateMany({ where: { usinaId: usina.id, ano: ANO, ativo: true }, data: { ativo: false } });
      await prisma.previsaoMensal.createMany({ data: dadosMensais });

      const geracaoAnoKwh = dadosMensais.reduce((s, m) => s + (m.geracaoPrevistaKwh ?? 0), 0);
      console.log(`[OK] ${usina.nome} (sem SKID): PrevisaoMensal versão ${novaVersaoUsina} (geração prevista ano ≈ ${geracaoAnoKwh.toFixed(0)} kWh)`);
      usinasAtualizadas++;
    }
  }

  console.log(`\nResumo: ${usinasAtualizadas} usina(s) atualizadas, ${usinasSemCorrespondencia} sem correspondência na planilha.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
