// Importação única dos dados reais fornecidos pelo usuário:
//   - "Cadastro Usinas.xlsx" (abas "Usinas PVsyst" e "Geração Mensal" — relatórios PVsyst)
//   - "Consolidado_Geracao_UFVs_2026_REV01.xlsx" (abas "Geração Diária Inversores" e "Irradiação Diária")
//
// Script idempotente: pode ser reexecutado — cadastro é upsert por nome normalizado; lançamentos
// diários das usinas afetadas são substituídos (deleteMany + createMany) a cada execução.
//
// Decisões de mapeamento confirmadas com o usuário em 2026-09-17 (ver docs/DECISOES_PLACEHOLDER.md):
//   - "UFV Cerado Pedra I/II/III" (cadastro) == "Usina Cercado da Pedra 01/02/03" (geração)
//   - "UFV Efizi" (cadastro) == "Usina Efize" (geração)
//   - A usina de teste "UFV Sítio do Pescoço" (Fase 2) é substituída pelos dados reais.
//   - "UFV Serra LOG" e "UFV Malhada" são cadastradas mesmo sem geração diária disponível.

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAMINHO_CADASTRO = "C:\\Users\\Eduardo Motta\\Desktop\\Dados de Geração\\Cadastro Usinas.xlsx";
const CAMINHO_GERACAO = "C:\\Users\\Eduardo Motta\\Desktop\\Dados de Geração\\Consolidado_Geracao_UFVs_2026_REV01.xlsx";

const ANO_METAS = 2026;
const G_REF = 1; // kW/m², referência PVsyst/especificação

// ---------- Normalização de nomes ----------

const ALIAS_GERACAO_PARA_CANONICO: Record<string, string> = {
  "cercado da pedra 01": "cerado pedra i",
  "cercado da pedra 02": "cerado pedra ii",
  "cercado da pedra 03": "cerado pedra iii",
  efize: "efizi",
};

function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizarNomeUsina(nomeBruto: string): string {
  let s = semAcentos(nomeBruto).toLowerCase().trim();
  s = s.replace(/^ufv\s+/, "").replace(/^usina\s+/, "");
  s = s.replace(/\s+/g, " ").trim();
  return ALIAS_GERACAO_PARA_CANONICO[s] ?? s;
}

function normalizarSkid(nomeBruto: string): string | null {
  const s = nomeBruto.trim();
  if (s === "-" || s === "") return null;
  const m = s.match(/skid\s*0*(\d+)/i);
  return m ? `SKID ${Number(m[1])}` : s;
}

function slugify(nomeBruto: string): string {
  return semAcentos(nomeBruto)
    .toUpperCase()
    .replace(/^UFV\s+/, "")
    .trim()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function paraData(v: unknown): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  return null;
}

// ---------- Leitura do Cadastro Usinas.xlsx ----------

interface LinhaSkidCadastro {
  nomeUsina: string;
  skid: string | null;
  quantidadeInversores: number | null;
  potenciaKwp: number | null;
  geracaoPrevistaAnoMwh: number | null;
  irradiacaoPrevistaAnoKwhM2: number | null;
  prPrevistoPct: number | null;
  p50Mwh: number | null;
  p90Mwh: number | null;
  inicioOperacao: Date | null;
}

async function lerUsinasPVsyst(): Promise<LinhaSkidCadastro[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CAMINHO_CADASTRO);
  const ws = wb.getWorksheet("Usinas PVsyst")!;
  const linhas: LinhaSkidCadastro[] = [];
  ws.eachRow((row, num) => {
    if (num < 4) return;
    const nomeUsina = String(row.getCell(1).value ?? "").trim();
    if (!nomeUsina) return;
    linhas.push({
      nomeUsina,
      skid: normalizarSkid(String(row.getCell(2).value ?? "")),
      quantidadeInversores: paraNumero(row.getCell(3).value),
      potenciaKwp: paraNumero(row.getCell(4).value),
      geracaoPrevistaAnoMwh: paraNumero(row.getCell(5).value),
      irradiacaoPrevistaAnoKwhM2: paraNumero(row.getCell(6).value),
      prPrevistoPct: paraNumero(row.getCell(7).value),
      p50Mwh: paraNumero(row.getCell(8).value),
      p90Mwh: paraNumero(row.getCell(9).value),
      inicioOperacao: paraData(row.getCell(10).value),
    });
  });
  return linhas;
}

interface TabelaMensal {
  titulo: string;
  linhas: { nomeUsina: string; skid: string | null; valoresMes: number[] }[]; // valoresMes[0..11] = Jan..Dez
}

async function lerTabelasMensais(): Promise<TabelaMensal[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CAMINHO_CADASTRO);
  const ws = wb.getWorksheet("Geração Mensal")!;

  const tabelas: TabelaMensal[] = [];
  let tabelaAtual: TabelaMensal | null = null;
  let dentroDeDados = false;

  ws.eachRow((row, num) => {
    const c1 = row.getCell(1).value;
    const texto = c1 === null || c1 === undefined ? "" : String(c1).trim();

    if (texto.endsWith("(MWh)") || texto.endsWith("(kWh/m²)") || texto.endsWith("(%)")) {
      tabelaAtual = { titulo: texto, linhas: [] };
      tabelas.push(tabelaAtual);
      dentroDeDados = false;
      return;
    }
    if (texto === "Nome") {
      dentroDeDados = true;
      return;
    }
    if (!dentroDeDados || !tabelaAtual || !texto) return;

    const skid = normalizarSkid(String(row.getCell(2).value ?? ""));
    const valoresMes: number[] = [];
    for (let col = 3; col <= 14; col++) valoresMes.push(paraNumero(row.getCell(col).value) ?? 0);
    tabelaAtual.linhas.push({ nomeUsina: texto, skid, valoresMes });
  });

  return tabelas;
}

// ---------- Leitura do Consolidado de Geração ----------

interface LinhaGeracaoDiaria {
  usina: string;
  skid: string | null;
  inversor: string;
  data: Date;
  energiaKwh: number;
}

async function lerGeracaoDiaria(): Promise<LinhaGeracaoDiaria[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CAMINHO_GERACAO);
  const ws = wb.getWorksheet("Geração Diária Inversores")!;
  const linhas: LinhaGeracaoDiaria[] = [];
  ws.eachRow((row, num) => {
    if (num === 1) return;
    const usina = String(row.getCell(1).value ?? "").trim();
    if (!usina) return;
    const data = paraData(row.getCell(4).value);
    const energia = paraNumero(row.getCell(5).value);
    if (!data || energia === null) return;
    linhas.push({
      usina,
      skid: normalizarSkid(String(row.getCell(2).value ?? "")),
      inversor: String(row.getCell(3).value ?? "").trim(),
      data,
      energiaKwh: energia,
    });
  });
  return linhas;
}

interface LinhaIrradiacaoDiaria {
  usina: string;
  fonte: string;
  data: Date;
  irradiacaoKwhM2: number;
}

async function lerIrradiacaoDiaria(): Promise<LinhaIrradiacaoDiaria[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CAMINHO_GERACAO);
  const ws = wb.getWorksheet("Irradiação Diária")!;
  const linhas: LinhaIrradiacaoDiaria[] = [];
  ws.eachRow((row, num) => {
    if (num === 1) return;
    const usina = String(row.getCell(1).value ?? "").trim();
    if (!usina) return;
    const data = paraData(row.getCell(3).value);
    const irradiacao = paraNumero(row.getCell(4).value);
    if (!data || irradiacao === null) return;
    linhas.push({ usina, fonte: String(row.getCell(2).value ?? "").trim(), data, irradiacaoKwhM2: irradiacao });
  });
  return linhas;
}

// ---------- Execução ----------

async function main() {
  console.log("Lendo planilhas...");
  const linhasPVsyst = await lerUsinasPVsyst();
  const tabelasMensais = await lerTabelasMensais();
  const geracaoDiaria = await lerGeracaoDiaria();
  const irradiacaoDiaria = await lerIrradiacaoDiaria();
  console.log(
    `Usinas PVsyst: ${linhasPVsyst.length} linhas. Tabelas mensais: ${tabelasMensais.map((t) => t.titulo).join(" | ")}. Geração diária: ${geracaoDiaria.length} linhas. Irradiação diária: ${irradiacaoDiaria.length} linhas.`
  );

  // 1) Substituir a usina de teste "Sítio do Pescoço" (Fase 2), se existir.
  const usinaTeste = await prisma.usina.findFirst({ where: { identificadorInterno: "SP-001" } });
  if (usinaTeste) {
    await prisma.usina.delete({ where: { id: usinaTeste.id } });
    console.log('Usina de teste "UFV Sítio do Pescoço" (SP-001) removida — substituída pelos dados reais.');
  }

  // 2) Agrupar linhas do cadastro por usina.
  const usinasPorNome = new Map<string, LinhaSkidCadastro[]>();
  for (const linha of linhasPVsyst) {
    const chave = normalizarNomeUsina(linha.nomeUsina);
    if (!usinasPorNome.has(chave)) usinasPorNome.set(chave, []);
    usinasPorNome.get(chave)!.push(linha);
  }

  const usinaIdPorNomeNormalizado = new Map<string, string>();
  const skidIdPorChave = new Map<string, string>(); // `${usinaId}|${skidNome}`

  for (const [chave, linhasDaUsina] of usinasPorNome) {
    const nomeOriginal = linhasDaUsina[0].nomeUsina;
    const potenciaTotalKwp = linhasDaUsina.reduce((s, l) => s + (l.potenciaKwp ?? 0), 0);
    const inicioOperacao = linhasDaUsina
      .map((l) => l.inicioOperacao)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const situacao = inicioOperacao && inicioOperacao.getTime() <= Date.now() ? "OPERACAO" : "IMPLANTACAO";

    const identificadorInterno = slugify(nomeOriginal);
    const usina = await prisma.usina.upsert({
      where: { identificadorInterno },
      update: {
        potenciaDcKwp: potenciaTotalKwp,
        inicioOperacao,
        situacao,
        planoIrradiacao: "POA",
      },
      create: {
        nome: nomeOriginal,
        identificadorInterno,
        potenciaDcKwp: potenciaTotalKwp,
        inicioOperacao,
        situacao,
        planoIrradiacao: "POA",
        observacoes: "Importado de Cadastro Usinas.xlsx (relatórios PVsyst) em " + new Date().toISOString().slice(0, 10) + ".",
      },
    });
    usinaIdPorNomeNormalizado.set(chave, usina.id);

    // SKIDs (usinas com skid "-" não têm subdivisão por SKID).
    for (const linha of linhasDaUsina) {
      if (!linha.skid) continue;
      const skid = await prisma.skid.upsert({
        where: { usinaId_nome: { usinaId: usina.id, nome: linha.skid } },
        update: { potenciaFvKwp: linha.potenciaKwp ?? undefined, inicioOperacao: linha.inicioOperacao ?? undefined },
        create: { usinaId: usina.id, nome: linha.skid, potenciaFvKwp: linha.potenciaKwp, inicioOperacao: linha.inicioOperacao },
      });
      skidIdPorChave.set(`${usina.id}|${linha.skid}`, skid.id);
    }

    // Previsão anual (P50/P90 somados — nunca média simples).
    const p50TotalKwh = linhasDaUsina.reduce((s, l) => s + (l.p50Mwh ?? 0) * 1000, 0);
    const p90TotalKwh = linhasDaUsina.reduce((s, l) => s + (l.p90Mwh ?? 0) * 1000, 0);

    const versaoAnteriorAnual = await prisma.previsaoAnual.findFirst({ where: { usinaId: usina.id, ano: ANO_METAS, ativo: true } });
    await prisma.previsaoAnual.updateMany({ where: { usinaId: usina.id, ano: ANO_METAS, ativo: true }, data: { ativo: false } });
    await prisma.previsaoAnual.create({
      data: {
        usinaId: usina.id,
        ano: ANO_METAS,
        versao: (versaoAnteriorAnual?.versao ?? 0) + 1,
        geracaoP50Kwh: p50TotalKwh,
        geracaoP90Kwh: p90TotalKwh,
        documentoOrigem: "Cadastro Usinas.xlsx — relatórios PVsyst",
      },
    });
  }

  console.log(`Usinas cadastradas/atualizadas: ${usinaIdPorNomeNormalizado.size}`);

  // 3) Previsão mensal (E_Grid, GlobEff e PR ponderado — a partir das 3 tabelas empilhadas).
  const tabGeracao = tabelasMensais.find((t) => t.titulo.startsWith("Geração Mensal"))!;
  const tabIrradiacao = tabelasMensais.find((t) => t.titulo.startsWith("Irradiação Mensal"))!;

  interface AgregadoSkidMes {
    potenciaKwp: number;
    geracaoKwh: number;
    irradiacaoKwhM2: number;
  }

  for (const [chave, usinaId] of usinaIdPorNomeNormalizado) {
    const linhasCadastro = usinasPorNome.get(chave)!;
    const potenciaPorSkid = new Map<string, number>();
    for (const l of linhasCadastro) if (l.skid) potenciaPorSkid.set(l.skid, l.potenciaKwp ?? 0);
    const potenciaUnica = linhasCadastro[0].potenciaKwp ?? 0; // usinas sem SKID ("-")

    const linhasGeracaoUsina = tabGeracao.linhas.filter((l) => normalizarNomeUsina(l.nomeUsina) === chave);
    const linhasIrradiacaoUsina = tabIrradiacao.linhas.filter((l) => normalizarNomeUsina(l.nomeUsina) === chave);

    const versaoAnterior = await prisma.previsaoMensal.findFirst({ where: { usinaId, ano: ANO_METAS, ativo: true }, orderBy: { versao: "desc" } });
    const novaVersao = (versaoAnterior?.versao ?? 0) + 1;
    await prisma.previsaoMensal.updateMany({ where: { usinaId, ano: ANO_METAS, ativo: true }, data: { ativo: false } });

    const dadosMensais = [];
    for (let mes = 1; mes <= 12; mes++) {
      const idx = mes - 1;
      const porSkid: AgregadoSkidMes[] = [];
      for (const lg of linhasGeracaoUsina) {
        const li = linhasIrradiacaoUsina.find((l) => l.skid === lg.skid);
        const potencia = lg.skid ? potenciaPorSkid.get(lg.skid) ?? 0 : potenciaUnica;
        porSkid.push({
          potenciaKwp: potencia,
          geracaoKwh: lg.valoresMes[idx] * 1000, // MWh -> kWh
          irradiacaoKwhM2: li ? li.valoresMes[idx] : 0,
        });
      }
      const geracaoTotalKwh = porSkid.reduce((s, x) => s + x.geracaoKwh, 0);
      const potenciaTotal = porSkid.reduce((s, x) => s + x.potenciaKwp, 0);
      const irradiacaoPonderada = potenciaTotal > 0 ? porSkid.reduce((s, x) => s + x.irradiacaoKwhM2 * x.potenciaKwp, 0) / potenciaTotal : null;
      const energiaTeorica = porSkid.reduce((s, x) => s + (x.potenciaKwp * x.irradiacaoKwhM2) / G_REF, 0);
      const prPrevistoPct = energiaTeorica > 0 ? (100 * geracaoTotalKwh) / energiaTeorica : null;

      dadosMensais.push({
        usinaId,
        ano: ANO_METAS,
        mes,
        versao: novaVersao,
        geracaoPrevistaKwh: porSkid.length ? geracaoTotalKwh : null,
        irradiacaoPrevistaKwhM2: irradiacaoPonderada,
        prPrevistoPct,
        documentoOrigem: "Cadastro Usinas.xlsx — relatórios PVsyst (Geração Mensal)",
      });
    }
    await prisma.previsaoMensal.createMany({ data: dadosMensais });
  }
  console.log("Previsões mensais (E_Grid/GlobEff/PR ponderado) gravadas para o ano " + ANO_METAS + ".");

  // 4) Geração diária por inversor — cria SKIDs/Inversores que só existem no arquivo de geração
  //    (usinas sem subdivisão em SKID no cadastro) e grava os lançamentos em lote.
  const inversorIdPorChave = new Map<string, string>(); // `${usinaId}|${skidId ?? '-'}|${inversor}`
  const usinasNaoEncontradas = new Set<string>();

  async function resolverUsinaId(nomeBruto: string): Promise<string | null> {
    const chave = normalizarNomeUsina(nomeBruto);
    const id = usinaIdPorNomeNormalizado.get(chave);
    if (!id) usinasNaoEncontradas.add(nomeBruto);
    return id ?? null;
  }

  async function resolverSkidId(usinaId: string, skidNome: string | null): Promise<string | null> {
    if (!skidNome) return null;
    const chave = `${usinaId}|${skidNome}`;
    if (skidIdPorChave.has(chave)) return skidIdPorChave.get(chave)!;
    const skid = await prisma.skid.upsert({
      where: { usinaId_nome: { usinaId, nome: skidNome } },
      update: {},
      create: { usinaId, nome: skidNome },
    });
    skidIdPorChave.set(chave, skid.id);
    return skid.id;
  }

  async function resolverInversorId(usinaId: string, skidId: string | null, identificacao: string): Promise<string> {
    const chave = `${usinaId}|${skidId ?? "-"}|${identificacao}`;
    if (inversorIdPorChave.has(chave)) return inversorIdPorChave.get(chave)!;
    // Prisma não aceita null em campo de chave composta única no where do upsert (limitação do
    // client) — busca manual + criação, igual ao padrão usado para os lançamentos diários.
    const existente = await prisma.inversor.findFirst({ where: { usinaId, skidId, identificacao } });
    const inversor = existente ?? (await prisma.inversor.create({ data: { usinaId, skidId, identificacao } }));
    inversorIdPorChave.set(chave, inversor.id);
    return inversor.id;
  }

  console.log("Processando geração diária por inversor (isso grava em lotes)...");
  const usinasAfetadasGeracao = new Set<string>();
  const lotesGeracao: { usinaId: string; skidId: string | null; inversorId: string; data: Date; energiaKwh: number; origem: string }[] = [];

  for (const linha of geracaoDiaria) {
    const usinaId = await resolverUsinaId(linha.usina);
    if (!usinaId) continue;
    usinasAfetadasGeracao.add(usinaId);
    const skidId = await resolverSkidId(usinaId, linha.skid);
    const inversorId = await resolverInversorId(usinaId, skidId, linha.inversor);
    lotesGeracao.push({ usinaId, skidId, inversorId, data: linha.data, energiaKwh: linha.energiaKwh, origem: "Importação — Consolidado_Geracao_UFVs_2026" });
  }

  await prisma.lancamentoGeracaoDiaria.deleteMany({ where: { usinaId: { in: [...usinasAfetadasGeracao] } } });
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < lotesGeracao.length; i += TAMANHO_LOTE) {
    await prisma.lancamentoGeracaoDiaria.createMany({ data: lotesGeracao.slice(i, i + TAMANHO_LOTE) });
  }
  console.log(`Lançamentos de geração diária gravados: ${lotesGeracao.length}.`);

  // 5) Irradiação diária.
  console.log("Processando irradiação diária...");
  const usinasAfetadasIrradiacao = new Set<string>();
  const lotesIrradiacao: { usinaId: string; skidId: string | null; data: Date; irradiacaoKwhM2: number; plano: string; origem: string }[] = [];

  for (const linha of irradiacaoDiaria) {
    const usinaId = await resolverUsinaId(linha.usina);
    if (!usinaId) continue;
    usinasAfetadasIrradiacao.add(usinaId);
    const fonteNormalizada = normalizarSkid(linha.fonte);
    const skidId = linha.fonte.toLowerCase().includes("geral") ? null : await resolverSkidId(usinaId, fonteNormalizada);
    lotesIrradiacao.push({
      usinaId,
      skidId,
      data: linha.data,
      irradiacaoKwhM2: linha.irradiacaoKwhM2,
      plano: "POA",
      origem: "Importação — Consolidado_Geracao_UFVs_2026",
    });
  }

  await prisma.lancamentoIrradiacaoDiaria.deleteMany({ where: { usinaId: { in: [...usinasAfetadasIrradiacao] } } });
  for (let i = 0; i < lotesIrradiacao.length; i += TAMANHO_LOTE) {
    await prisma.lancamentoIrradiacaoDiaria.createMany({ data: lotesIrradiacao.slice(i, i + TAMANHO_LOTE) });
  }
  console.log(`Lançamentos de irradiação diária gravados: ${lotesIrradiacao.length}.`);

  if (usinasNaoEncontradas.size > 0) {
    console.warn("ATENÇÃO — nomes de usina no arquivo de geração sem correspondência no cadastro:", [...usinasNaoEncontradas]);
  }

  console.log("Importação concluída.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
