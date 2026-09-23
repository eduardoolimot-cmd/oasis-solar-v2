import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { RelatorioSnapshot } from "./relatorioSnapshot";

// Geração do arquivo (PDF/Excel/CSV) sempre a partir de um snapshot já gravado — nunca recalcula.
// Estrutura fiel ao modelo "Relatório UFV Sítio do Pescoço": cabeçalho, 1. Dados da instalação,
// 2. Resumo operacional do mês, 3. Geração por SKID, 4. Histórico de manutenção/ocorrências.
// Poppins não está disponível como fonte embutida no gerador de PDF (sem .ttf no projeto) —
// Helvetica é usada até que a fonte oficial seja fornecida.

const AZUL = "#00386D";
const AZUL_CLARO = "#F1F6FB";
const LARANJA = "#EE7528";
const CINZA = "#878787";
const TEXTO = "#1F2933";
const VERDE = "#16A34A";
const VERMELHO = "#DC2626";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmtNum(v: number | null, casas = 0): string {
  if (v === null) return "N/D";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function variacaoPct(previsto: number | null, realizado: number | null): number | null {
  if (previsto === null || realizado === null || previsto === 0) return null;
  return ((realizado - previsto) / previsto) * 100;
}

function fmtVariacao(v: number | null, unidade = "%"): string {
  if (v === null) return "N/D";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unidade === "%" ? "%" : " p.p."}`;
}

function corVariacao(v: number | null): string {
  if (v === null) return CINZA;
  return v >= 0 ? VERDE : VERMELHO;
}

/// "Julho / 2026" quando o período é exatamente um mês civil; senão o intervalo de datas.
function rotuloPeriodo(inicioIso: string, fimIso: string): string {
  const i = new Date(inicioIso);
  const f = new Date(fimIso);
  const mesCompleto =
    i.getUTCDate() === 1 &&
    i.getUTCFullYear() === f.getUTCFullYear() &&
    i.getUTCMonth() === f.getUTCMonth() &&
    new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate() === f.getUTCDate();
  return mesCompleto ? `${MESES[i.getUTCMonth()]} / ${i.getUTCFullYear()}` : `${fmtData(inicioIso)} a ${fmtData(fimIso)}`;
}

function textoConclusao(s: RelatorioSnapshot): string {
  const v = variacaoPct(s.resumo.geracao.previstoKwh, s.resumo.geracao.realizadoKwh);
  if (v === null) return "Sem base de comparação (geração prevista ou realizada indisponível) para o período.";
  if (v >= -5) {
    return "A operação encontra-se monitorada e dentro dos parâmetros. Recomenda-se a continuidade do monitoramento preventivo para preservação da vida útil dos equipamentos.";
  }
  return "A geração realizada ficou abaixo do previsto para o período. Recomenda-se analisar as ocorrências e manutenções registradas neste relatório e as condições climáticas do mês.";
}

export function gerarPdf(s: RelatorioSnapshot): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const larguraPagina = 595.28;
  const margem = 50;
  const larguraUtil = larguraPagina - margem * 2;

  // Cabeçalho
  doc.rect(0, 0, larguraPagina, 105).fill(AZUL);
  doc.rect(0, 105, larguraPagina, 3).fill(LARANJA);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("RELATÓRIO DE GERAÇÃO SOLAR", margem, 32, { width: larguraUtil });
  doc.font("Helvetica").fontSize(11).text(s.usina.nome, margem, 66, { width: larguraUtil });
  doc.font("Helvetica-Bold").fontSize(12).text(rotuloPeriodo(s.periodo.inicio, s.periodo.fim), margem, 66, { width: larguraUtil, align: "right" });
  doc.y = 130;

  function garantirEspaco(altura: number) {
    if (doc.y + altura > 780) {
      doc.addPage({ size: "A4", margin: 0 });
      doc.y = 50;
    }
  }

  function secao(titulo: string) {
    garantirEspaco(60);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(AZUL).text(titulo, margem, doc.y, { width: larguraUtil });
    doc.moveDown(0.3);
    doc.strokeColor(AZUL).lineWidth(0.8).moveTo(margem, doc.y).lineTo(margem + larguraUtil, doc.y).stroke();
    doc.y += 8;
  }

  function parChaveValor(x: number, y: number, rotulo: string, valor: string, larguraRotulo = 75) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEXTO).text(`${rotulo}:`, x, y, { width: larguraRotulo, lineBreak: false });
    doc.font("Helvetica").text(valor, x + larguraRotulo, y, { width: larguraUtil / 2 - larguraRotulo - 6, lineBreak: false });
  }

  function tabela(colunas: { titulo: string; largura: number; alinhar?: "left" | "right"; cor?: (v: string, i: number) => string | undefined }[], linhas: string[][], rodape?: string[]) {
    const alturaLinha = 20;
    function cabecalho() {
      garantirEspaco(alturaLinha * 2);
      const y = doc.y;
      doc.rect(margem, y, larguraUtil, alturaLinha).fill(AZUL);
      let x = margem;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
      for (const c of colunas) {
        doc.text(c.titulo, x + 6, y + 6, { width: c.largura - 12, align: c.alinhar ?? "left", lineBreak: false });
        x += c.largura;
      }
      doc.y = y + alturaLinha;
    }
    function desenharLinha(valores: string[], indice: number, destaque = false) {
      if (doc.y + alturaLinha > 780) {
        doc.addPage({ size: "A4", margin: 0 });
        doc.y = 50;
        cabecalho();
      }
      const y = doc.y;
      if (destaque) doc.rect(margem, y, larguraUtil, alturaLinha).fill("#E4EEF8");
      else if (indice % 2 === 0) doc.rect(margem, y, larguraUtil, alturaLinha).fill(AZUL_CLARO);
      let x = margem;
      colunas.forEach((c, k) => {
        const cor = c.cor?.(valores[k], indice) ?? (destaque ? AZUL : TEXTO);
        doc.font(destaque || k === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(cor);
        doc.text(valores[k], x + 6, y + 6, { width: c.largura - 12, align: c.alinhar ?? "left", lineBreak: false, ellipsis: true });
        x += c.largura;
      });
      doc.y = y + alturaLinha;
    }
    cabecalho();
    linhas.forEach((l, i) => desenharLinha(l, i));
    if (rodape) desenharLinha(rodape, 0, true);
    doc.y += 14;
  }

  // 1. Dados da instalação
  secao("1. DADOS DA INSTALAÇÃO");
  const yInst = doc.y;
  const xDireita = margem + larguraUtil / 2 + 10;
  parChaveValor(margem, yInst, "Instalação", s.usina.nome);
  parChaveValor(margem, yInst + 15, "Início", s.usina.inicioOperacao ? fmtData(s.usina.inicioOperacao) : "N/D");
  parChaveValor(margem, yInst + 30, "Módulos", s.usina.totalModulos !== null ? fmtNum(s.usina.totalModulos) : "N/D");
  parChaveValor(xDireita, yInst, "Potência", `${fmtNum(s.usina.potenciaDcKwp)} kWp`, 65);
  parChaveValor(
    xDireita,
    yInst + 15,
    "Localização",
    s.usina.latitude !== null && s.usina.longitude !== null ? `${s.usina.latitude.toFixed(6)}, ${s.usina.longitude.toFixed(6)}` : "N/D",
    65
  );
  parChaveValor(xDireita, yInst + 30, "Inversores", s.usina.totalInversores > 0 ? fmtNum(s.usina.totalInversores) : "N/D", 65);
  doc.y = yInst + 55;

  // 2. Resumo operacional
  secao("2. RESUMO OPERACIONAL DO MÊS");
  const vGer = variacaoPct(s.resumo.geracao.previstoKwh, s.resumo.geracao.realizadoKwh);
  const vIrr = variacaoPct(s.resumo.irradiacao.previstoKwhM2, s.resumo.irradiacao.realizadoKwhM2);
  const vPr =
    s.resumo.pr.previstoPct !== null && s.resumo.pr.realizadoPct !== null ? s.resumo.pr.realizadoPct - s.resumo.pr.previstoPct : null;
  const corDaVariacao = (_v: string, i: number) => corVariacao([vGer, vIrr, vPr][i]);
  tabela(
    [
      { titulo: "Indicador", largura: 175 },
      { titulo: "Previsto", largura: 105 },
      { titulo: "Realizado", largura: 105 },
      { titulo: "Variação", largura: larguraUtil - 385, cor: corDaVariacao },
    ],
    [
      ["Geração (kWh)", fmtNum(s.resumo.geracao.previstoKwh), fmtNum(s.resumo.geracao.realizadoKwh), fmtVariacao(vGer)],
      ["Irradiação (kWh/m²)", fmtNum(s.resumo.irradiacao.previstoKwhM2, 1), fmtNum(s.resumo.irradiacao.realizadoKwhM2, 1), fmtVariacao(vIrr)],
      [
        "Performance Ratio (%)",
        s.resumo.pr.previstoPct !== null ? `${fmtNum(s.resumo.pr.previstoPct, 1)}%` : "N/D",
        s.resumo.pr.realizadoPct !== null ? `${fmtNum(s.resumo.pr.realizadoPct, 1)}%` : "N/D",
        fmtVariacao(vPr, "pp"),
      ],
    ]
  );
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEXTO).text("Condições climáticas:", margem, doc.y, { continued: true });
  doc
    .font("Helvetica")
    .text(
      s.clima.disponivel
        ? ` ${fmtNum(s.clima.precipitacaoAcumuladaMm, 1)} mm de chuva acumulada no período${s.clima.diasComChuva !== null ? ` (${s.clima.diasComChuva} dia(s) com chuva)` : ""}.`
        : ` ${s.clima.aviso ?? "N/D"}`
    );
  if (s.clima.disponivel && s.clima.aviso) doc.fontSize(8).fillColor(CINZA).text(s.clima.aviso, margem, doc.y, { width: larguraUtil });
  doc.y += 14;

  // 3. Geração por SKID
  secao("3. GERAÇÃO POR SKID");
  const totalPrevisto = s.skids.some((k) => k.previstoKwh !== null) ? s.skids.reduce((a, k) => a + (k.previstoKwh ?? 0), 0) : null;
  const totalRealizado = s.skids.some((k) => k.realizadoKwh !== null) ? s.skids.reduce((a, k) => a + (k.realizadoKwh ?? 0), 0) : null;
  const variacoesSkid = s.skids.map((k) => variacaoPct(k.previstoKwh, k.realizadoKwh));
  if (s.skids.length === 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor(CINZA).text("Esta usina não possui SKIDs cadastrados.", margem, doc.y);
    doc.y += 14;
  } else {
    tabela(
      [
        { titulo: "SKID", largura: 90 },
        { titulo: "UC", largura: 145 },
        { titulo: "Previsto (kWh)", largura: 95 },
        { titulo: "Realizado (kWh)", largura: 100 },
        { titulo: "Variação", largura: larguraUtil - 430, cor: (_v, i) => corVariacao(variacoesSkid[i] ?? null) },
      ],
      s.skids.map((k, i) => [k.nome, k.uc ?? "N/D", fmtNum(k.previstoKwh), fmtNum(k.realizadoKwh), fmtVariacao(variacoesSkid[i])]),
      ["TOTAL DA USINA", "", fmtNum(totalPrevisto), fmtNum(totalRealizado), fmtVariacao(variacaoPct(totalPrevisto, totalRealizado))]
    );
  }

  // 4. Histórico de manutenção / ocorrências
  secao("4. HISTÓRICO DE MANUTENÇÃO / OCORRÊNCIAS");
  if (s.manutencao.length === 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor(CINZA).text("Nenhuma manutenção ou ocorrência registrada no período.", margem, doc.y);
    doc.y += 14;
  } else {
    tabela(
      [
        { titulo: "Tipo", largura: 80 },
        { titulo: "Data", largura: 75 },
        { titulo: "Título", largura: larguraUtil - 275 },
        { titulo: "Responsável", largura: 120 },
      ],
      s.manutencao.map((m) => [m.tipo, fmtData(m.data), m.titulo, m.responsavel ?? "—"])
    );
  }

  // Conclusão
  garantirEspaco(60);
  const textoFinal = textoConclusao(s);
  const alturaCaixa = doc.font("Helvetica").fontSize(9.5).heightOfString(textoFinal, { width: larguraUtil - 24 }) + 16;
  const yCaixa = doc.y;
  doc.rect(margem, yCaixa, larguraUtil, alturaCaixa).fill("#EEF3F9");
  doc.rect(margem, yCaixa, 4, alturaCaixa).fill(AZUL);
  doc.fillColor(TEXTO).text(textoFinal, margem + 14, yCaixa + 8, { width: larguraUtil - 24 });
  doc.y = yCaixa + alturaCaixa + 10;

  // Rodapé em todas as páginas
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#8FA3B8")
      .text(`Documento gerado pelo sistema OASIS SOLAR em ${new Date().toLocaleString("pt-BR")} · página ${i + 1} de ${paginas.count}`, margem, 810, {
        width: larguraUtil,
        align: "center",
        lineBreak: false,
      });
  }

  return doc;
}

function linhasPlanas(s: RelatorioSnapshot): (string | number)[][] {
  const vGer = variacaoPct(s.resumo.geracao.previstoKwh, s.resumo.geracao.realizadoKwh);
  const vIrr = variacaoPct(s.resumo.irradiacao.previstoKwhM2, s.resumo.irradiacao.realizadoKwhM2);
  const vPr = s.resumo.pr.previstoPct !== null && s.resumo.pr.realizadoPct !== null ? s.resumo.pr.realizadoPct - s.resumo.pr.previstoPct : null;
  const totalPrevisto = s.skids.some((k) => k.previstoKwh !== null) ? s.skids.reduce((a, k) => a + (k.previstoKwh ?? 0), 0) : null;
  const totalRealizado = s.skids.some((k) => k.realizadoKwh !== null) ? s.skids.reduce((a, k) => a + (k.realizadoKwh ?? 0), 0) : null;

  const linhas: (string | number)[][] = [
    ["RELATÓRIO DE GERAÇÃO SOLAR", s.usina.nome, rotuloPeriodo(s.periodo.inicio, s.periodo.fim)],
    [],
    ["1. DADOS DA INSTALAÇÃO"],
    ["Instalação", s.usina.nome],
    ["Início da operação", s.usina.inicioOperacao ? fmtData(s.usina.inicioOperacao) : "N/D"],
    ["Potência (kWp)", fmtNum(s.usina.potenciaDcKwp)],
    ["Localização", s.usina.latitude !== null && s.usina.longitude !== null ? `${s.usina.latitude}, ${s.usina.longitude}` : "N/D"],
    ["Módulos", s.usina.totalModulos !== null ? fmtNum(s.usina.totalModulos) : "N/D"],
    ["Inversores", s.usina.totalInversores > 0 ? fmtNum(s.usina.totalInversores) : "N/D"],
    [],
    ["2. RESUMO OPERACIONAL DO MÊS"],
    ["Indicador", "Previsto", "Realizado", "Variação"],
    ["Geração (kWh)", fmtNum(s.resumo.geracao.previstoKwh), fmtNum(s.resumo.geracao.realizadoKwh), fmtVariacao(vGer)],
    ["Irradiação (kWh/m²)", fmtNum(s.resumo.irradiacao.previstoKwhM2, 1), fmtNum(s.resumo.irradiacao.realizadoKwhM2, 1), fmtVariacao(vIrr)],
    [
      "Performance Ratio (%)",
      s.resumo.pr.previstoPct !== null ? fmtNum(s.resumo.pr.previstoPct, 1) : "N/D",
      s.resumo.pr.realizadoPct !== null ? fmtNum(s.resumo.pr.realizadoPct, 1) : "N/D",
      fmtVariacao(vPr, "pp"),
    ],
    ["Chuva acumulada (mm)", s.clima.disponivel ? fmtNum(s.clima.precipitacaoAcumuladaMm, 1) : s.clima.aviso ?? "N/D"],
    [],
    ["3. GERAÇÃO POR SKID"],
    ["SKID", "UC", "Previsto (kWh)", "Realizado (kWh)", "Variação"],
    ...s.skids.map((k) => [k.nome, k.uc ?? "N/D", fmtNum(k.previstoKwh), fmtNum(k.realizadoKwh), fmtVariacao(variacaoPct(k.previstoKwh, k.realizadoKwh))]),
    ["TOTAL DA USINA", "", fmtNum(totalPrevisto), fmtNum(totalRealizado), fmtVariacao(variacaoPct(totalPrevisto, totalRealizado))],
    [],
    ["4. HISTÓRICO DE MANUTENÇÃO / OCORRÊNCIAS"],
    ["Tipo", "Data", "Título", "Responsável"],
    ...s.manutencao.map((m) => [m.tipo, fmtData(m.data), m.titulo, m.responsavel ?? "—"]),
  ];
  return linhas;
}

export async function gerarExcel(s: RelatorioSnapshot): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet("Relatório");
  for (const linha of linhasPlanas(s)) {
    const row = planilha.addRow(linha);
    const primeira = String(linha[0] ?? "");
    if (/^\d\. /.test(primeira) || primeira.startsWith("RELATÓRIO")) row.font = { bold: true, color: { argb: "FF00386D" } };
    if (["Indicador", "SKID", "Tipo"].includes(primeira) || primeira.startsWith("TOTAL")) row.font = { bold: true };
  }
  planilha.getColumn(1).width = 30;
  planilha.getColumn(2).width = 34;
  planilha.getColumn(3).width = 44;
  planilha.getColumn(4).width = 22;
  planilha.getColumn(5).width = 14;
  return workbook.xlsx.writeBuffer();
}

export function gerarCsv(s: RelatorioSnapshot): string {
  const linhas = linhasPlanas(s).map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
  return "﻿" + linhas.join("\r\n");
}
