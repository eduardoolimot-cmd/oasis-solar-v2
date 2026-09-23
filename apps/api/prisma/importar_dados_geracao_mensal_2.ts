// Atualização das metas mensais a partir de "Dados_de_Geração_Mensal_2.xlsx" (2026-09-20).
// Abas usadas (linhas = usina + SKID; "-" = usina sem subdivisão):
//   - Planilha1              geração E_Grid mensal por SKID, em MWh  -> PrevisaoMensalSkid.geracaoEGridKwh (×1000)
//   - Geração Bruta P50/P90  kWh/mês por SKID                        -> PrevisaoMensal.geracaoP50Kwh / geracaoP90Kwh (soma dos SKIDs)
//   - Disponibilidade Meta   fração (0,98)                           -> PrevisaoMensal.dispGeracaoMetaPct (×100)
// A meta de disponibilidade de comunicação está em branco no arquivo: não é inventada, o valor
// anterior é preservado. Irradiação e PR previstos não vêm neste arquivo: também preservados.
//
// Sem --aplicar apenas simula (não grava nada). Com --aplicar: cada usina/SKID que muda ganha uma
// NOVA versão (updateMany ativo=false + createMany versao+1); nada é sobrescrito. Reexecutar sem
// mudança nos dados não cria versões novas. A previsão anual (PrevisaoAnual) só é desativada
// (histórico preservado) quando os 12 meses passam a ter P50 e P90 mensais — mesma regra de
// salvarNovaVersao em previsoes.routes.ts.
//
// Uso: npx tsx prisma/importar_dados_geracao_mensal_2.ts "<caminho do xlsx>" [--aplicar]

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const ANO = 2026;
const APLICAR = process.argv.includes("--aplicar");
const CAMINHO = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const DOCUMENTO_ORIGEM = "Atualização 2026-09-20 — Dados_de_Geração_Mensal_2.xlsx (Planilha1, Geração Bruta P50/P90, Disponibilidade Meta)";
const EPS = 0.001;

interface LinhaSkid {
  usina: string;
  skid: string;
  geracaoKwh: number[];
  p50Kwh: number[];
  p90Kwh: number[];
  dispPct: number;
}

const valor = (c: unknown): unknown => (c && typeof c === "object" && "result" in (c as object) ? (c as { result: unknown }).result : c);
const arred = (n: number) => Math.round(n * 1000) / 1000;
const igual = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? a == b : Math.abs(a - b) < EPS);

async function lerArquivo(caminho: string): Promise<LinhaSkid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const abas = ["Planilha1", "Geração Bruta P50", "Geração Bruta P90", "Disponibilidade Meta"].map((n) => {
    const ws = wb.getWorksheet(n);
    if (!ws) throw new Error(`Aba "${n}" não encontrada no arquivo.`);
    return ws;
  });
  const [wsGeracao, wsP50, wsP90, wsDisp] = abas;

  const meses = (ws: ExcelJS.Worksheet, r: number, fator: number) =>
    Array.from({ length: 12 }, (_, i) => {
      const v = Number(valor(ws.getRow(r).getCell(3 + i).value));
      if (Number.isNaN(v)) throw new Error(`Valor não numérico em "${ws.name}" linha ${r}, coluna ${3 + i}.`);
      return arred(v * fator);
    });

  const linhas: LinhaSkid[] = [];
  for (let r = 2; r <= wsGeracao.rowCount; r++) {
    const usina = String(valor(wsGeracao.getRow(r).getCell(1).value) ?? "").trim();
    if (!usina) continue;
    const skid = String(valor(wsGeracao.getRow(r).getCell(2).value) ?? "").trim();
    // As demais abas são fórmulas alinhadas linha a linha com a Planilha1 — confere a identidade.
    for (const ws of [wsP50, wsP90, wsDisp]) {
      const u = String(valor(ws.getRow(r).getCell(1).value) ?? "").trim();
      const s = String(valor(ws.getRow(r).getCell(2).value) ?? "").trim();
      if (u !== usina || s !== skid) throw new Error(`Linha ${r} de "${ws.name}" (${u} / ${s}) não corresponde à Planilha1 (${usina} / ${skid}).`);
    }
    const disp = Number(valor(wsDisp.getRow(r).getCell(3).value));
    if (Number.isNaN(disp) || disp < 0 || disp > 1) throw new Error(`Disponibilidade inválida na linha ${r}: ${disp}`);
    linhas.push({
      usina,
      skid,
      geracaoKwh: meses(wsGeracao, r, 1000), // MWh -> kWh
      p50Kwh: meses(wsP50, r, 1), // já em kWh
      p90Kwh: meses(wsP90, r, 1),
      dispPct: arred(disp * 100),
    });
  }
  return linhas;
}

async function main() {
  if (!CAMINHO) throw new Error("Informe o caminho do xlsx.");
  const linhas = await lerArquivo(CAMINHO);
  console.log(`${APLICAR ? "APLICANDO" : "SIMULAÇÃO (nada será gravado)"} — ${linhas.length} linhas lidas de ${CAMINHO}\n`);

  const usinas = await prisma.usina.findMany({
    include: { skids: { where: { ativo: true }, select: { id: true, nome: true, potenciaFvKwp: true } } },
    orderBy: { nome: "asc" },
  });
  const nomesPlanilha = new Set(linhas.map((l) => l.usina));
  for (const nome of nomesPlanilha) if (!usinas.some((u) => u.nome === nome)) console.log(`[ATENÇÃO] "${nome}" está na planilha mas não existe no banco — ignorada.`);

  let atualizadas = 0;
  for (const usina of usinas) {
    const doArquivo = linhas.filter((l) => l.usina === usina.nome);
    if (doArquivo.length === 0) {
      console.log(`[SEM DADOS NO ARQUIVO] ${usina.nome} — mantida como está.`);
      continue;
    }

    // Vincula cada linha ao SKID do banco ("-" só é válido para usina sem SKID ou com um único SKID).
    const vinculos = doArquivo.map((l) => {
      const skid = l.skid === "-" ? (usina.skids.length === 1 ? usina.skids[0] : null) : usina.skids.find((s) => s.nome === l.skid) ?? null;
      return { linha: l, skid };
    });
    const orfaos = vinculos.filter((v) => !v.skid && !(v.linha.skid === "-" && usina.skids.length === 0));
    if (orfaos.length > 0) {
      console.log(`[PULADA] ${usina.nome}: SKID(s) da planilha sem correspondência no banco: ${orfaos.map((o) => o.linha.skid).join(", ")}.`);
      continue;
    }
    if (usina.skids.length > 0 && vinculos.filter((v) => v.skid).length !== usina.skids.length) {
      console.log(`[PULADA] ${usina.nome}: a planilha não cobre todos os SKIDs ativos do banco (${usina.skids.map((s) => s.nome).join(", ")}).`);
      continue;
    }

    // ---- Nível SKID: só grava se a geração E_Grid mudou (irradiação/PR preservados) ----
    const acoesSkid: Array<() => Promise<void>> = [];
    let skidsAlterados = 0;
    for (const { linha, skid } of vinculos) {
      if (!skid) continue;
      const ativas = await prisma.previsaoMensalSkid.findMany({ where: { skidId: skid.id, ano: ANO, ativo: true } });
      const porMes = new Map(ativas.map((a) => [a.mes, a]));
      const mudou = linha.geracaoKwh.some((v, i) => !igual(porMes.get(i + 1)?.geracaoEGridKwh, v));
      if (!mudou) continue;
      skidsAlterados++;
      acoesSkid.push(async () => {
        const maxVersao = (await prisma.previsaoMensalSkid.findFirst({ where: { skidId: skid.id, ano: ANO }, orderBy: { versao: "desc" }, select: { versao: true } }))?.versao ?? 0;
        await prisma.$transaction([
          prisma.previsaoMensalSkid.updateMany({ where: { skidId: skid.id, ano: ANO, ativo: true }, data: { ativo: false } }),
          prisma.previsaoMensalSkid.createMany({
            data: linha.geracaoKwh.map((v, i) => ({
              usinaId: usina.id,
              skidId: skid.id,
              ano: ANO,
              mes: i + 1,
              versao: maxVersao + 1,
              geracaoEGridKwh: v,
              irradiacaoGlobEffKwhM2: porMes.get(i + 1)?.irradiacaoGlobEffKwhM2 ?? null,
              prPct: porMes.get(i + 1)?.prPct ?? null,
              documentoOrigem: DOCUMENTO_ORIGEM,
            })),
          }),
        ]);
      });
    }

    // ---- Nível usina: soma dos SKIDs (energia é aditiva); disponibilidade única ou ponderada por potência ----
    const soma = (campo: "geracaoKwh" | "p50Kwh" | "p90Kwh") => Array.from({ length: 12 }, (_, i) => arred(doArquivo.reduce((s, l) => s + l[campo][i], 0)));
    const ger = soma("geracaoKwh");
    const p50 = soma("p50Kwh");
    const p90 = soma("p90Kwh");
    const dispsDistintas = new Set(doArquivo.map((l) => l.dispPct));
    let disp: number;
    if (dispsDistintas.size === 1) {
      disp = doArquivo[0].dispPct;
    } else {
      const pesos = vinculos.map((v) => v.skid?.potenciaFvKwp ?? null);
      if (pesos.some((p) => p === null || p <= 0)) {
        console.log(`[PULADA] ${usina.nome}: metas de disponibilidade diferentes entre SKIDs e potência não cadastrada para ponderar.`);
        continue;
      }
      const total = pesos.reduce((s, p) => s + p!, 0);
      disp = arred(vinculos.reduce((s, v, i) => s + v.linha.dispPct * pesos[i]!, 0) / total);
    }

    const anteriores = await prisma.previsaoMensal.findMany({ where: { usinaId: usina.id, ano: ANO, ativo: true } });
    const antPorMes = new Map(anteriores.map((a) => [a.mes, a]));
    const usinaMudou = ger.some((v, i) => !igual(antPorMes.get(i + 1)?.geracaoPrevistaKwh, v)) ||
      p50.some((v, i) => !igual(antPorMes.get(i + 1)?.geracaoP50Kwh, v)) ||
      p90.some((v, i) => !igual(antPorMes.get(i + 1)?.geracaoP90Kwh, v)) ||
      Array.from({ length: 12 }, (_, i) => antPorMes.get(i + 1)?.dispGeracaoMetaPct).some((d) => !igual(d, disp));

    const anual = await prisma.previsaoAnual.findFirst({ where: { usinaId: usina.id, ano: ANO, ativo: true } });
    const somaAnt = (c: "geracaoP50Kwh" | "geracaoP90Kwh") => anteriores.reduce((s, a) => s + (a[c] ?? 0), 0);
    const somaNova = (v: number[]) => v.reduce((s, x) => s + x, 0);
    const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");
    console.log(
      `${usina.nome}: ` +
        `SKIDs com geração alterada=${skidsAlterados}/${vinculos.filter((v) => v.skid).length} | ` +
        `usina ${usinaMudou ? "ALTERADA" : "sem mudança"} (P50 ano ${fmt(somaAnt("geracaoP50Kwh"))} -> ${fmt(somaNova(p50))}; P90 ${fmt(somaAnt("geracaoP90Kwh"))} -> ${fmt(somaNova(p90))}; ` +
        `disp meta ${anteriores[0]?.dispGeracaoMetaPct ?? "vazio"} -> ${disp}%)` +
        (anual ? ` | previsão anual ativa (P50 ${fmt(anual.geracaoP50Kwh ?? 0)}) será desativada` : ""),
    );

    if (!APLICAR) continue;
    if (!usinaMudou && skidsAlterados === 0 && !anual) continue;

    for (const acao of acoesSkid) await acao();
    if (usinaMudou) {
      const maxVersao = (await prisma.previsaoMensal.findFirst({ where: { usinaId: usina.id, ano: ANO }, orderBy: { versao: "desc" }, select: { versao: true } }))?.versao ?? 0;
      await prisma.$transaction([
        prisma.previsaoMensal.updateMany({ where: { usinaId: usina.id, ano: ANO, ativo: true }, data: { ativo: false } }),
        prisma.previsaoMensal.createMany({
          data: Array.from({ length: 12 }, (_, i) => {
            const ant = antPorMes.get(i + 1);
            return {
              usinaId: usina.id,
              ano: ANO,
              mes: i + 1,
              versao: maxVersao + 1,
              geracaoPrevistaKwh: ger[i],
              geracaoP50Kwh: p50[i],
              geracaoP90Kwh: p90[i],
              irradiacaoPrevistaKwhM2: ant?.irradiacaoPrevistaKwhM2 ?? null,
              prPrevistoPct: ant?.prPrevistoPct ?? null,
              dispGeracaoMetaPct: disp,
              dispComunicacaoMetaPct: ant?.dispComunicacaoMetaPct ?? null,
              documentoOrigem: DOCUMENTO_ORIGEM,
              responsavel: null,
            };
          }),
        }),
      ]);
    }
    // Mensal completo (P50 e P90 nos 12 meses) substitui o cenário anual — o anual fica só como histórico.
    if (anual) await prisma.previsaoAnual.updateMany({ where: { usinaId: usina.id, ano: ANO, ativo: true }, data: { ativo: false } });
    atualizadas++;
  }
  console.log(APLICAR ? `\nConcluído: ${atualizadas} usina(s) atualizadas.` : "\nSimulação concluída — rode novamente com --aplicar para gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
