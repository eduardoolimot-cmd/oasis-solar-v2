import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// Formato antigo (Fase 8) dos relatórios de desempenho. Relatórios já emitidos nesse formato ficam
// guardados como snapshot JSON (sem campo "versao") e continuam podendo ser baixados exatamente
// como foram emitidos — só relatórios novos usam a estrutura atual (relatorioArquivo.ts).
export interface RelatorioSnapshot {
  usina: { id: string; nome: string; municipio: string | null; uf: string | null; potenciaDcKwp: number; potenciaAcKw: number | null };
  periodo: { inicio: string; fim: string };
  responsavel: string | null;
  geracao: { realizadaKwh: number | null; p50Kwh: number | null; p90Kwh: number | null; aderenciaP50Pct: number | null; aderenciaP90Pct: number | null };
  pr: { realizadoPct: number | null; esperadoPct: number | null; aderenciaPct: number | null };
  fc: { aferidoPct: number | null; baseUsada: "AC" | "DC" };
  disponibilidade: { geracaoPct: number | null; comunicacaoPct: number | null; mttrHoras: number | null; mtbfHoras: number | null };
  financeiro: { custoTotal: number; custoPorKwp: number | null; custoPorCategoria: Record<string, number> };
}

// Geração do arquivo (PDF/Excel/CSV) sempre a partir de um snapshot já gravado — nunca recalcula.
// Identidade do relatório: só a escrita tipográfica "OASIS SOLAR" (sem arquivo de logotipo
// aprovado ainda) e um campo de responsável livre, preenchido na emissão — ver
// docs/DECISOES_PLACEHOLDER.md, "Relatórios — identidade e retenção". Poppins não está disponível
// como fonte embutida no gerador de PDF (sem arquivo .ttf no projeto); Helvetica-Bold é usado como
// substituto até que a fonte oficial seja fornecida.

const COR_AZUL_MARINHO = "#00386D";
const COR_LARANJA = "#EE7528";
const COR_CINZA = "#878787";

function fmtNum(v: number | null, casas = 2): string {
  if (v === null) return "Sem dados";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtPct(v: number | null): string {
  return v === null ? "Sem dados" : `${fmtNum(v, 2)}%`;
}

function fmtMoeda(v: number | null): string {
  if (v === null) return "Não calculável";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const ROTULO_CATEGORIA: Record<string, string> = {
  PECAS_ESTOQUE: "Peças (consumo de estoque)",
  MAO_DE_OBRA: "Mão de obra",
  SERVICO_TERCEIRIZADO: "Serviço terceirizado",
  PECAS_AVULSAS: "Peças avulsas",
  OUTROS: "Outros",
};

export function gerarPdf(snapshot: RelatorioSnapshot): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  doc.font("Helvetica-Bold").fontSize(20).fillColor(COR_AZUL_MARINHO).text("OASIS SOLAR", { continued: false });
  doc.font("Helvetica").fontSize(10).fillColor(COR_CINZA).text("Relatório de Desempenho da Usina");
  doc.moveDown(0.5);
  doc.strokeColor(COR_LARANJA).lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(15).fillColor(COR_AZUL_MARINHO).text(snapshot.usina.nome);
  doc.font("Helvetica").fontSize(10).fillColor("#333").text(
    `${snapshot.usina.municipio ? `${snapshot.usina.municipio}/${snapshot.usina.uf}` : "Localização não informada"} · ${(snapshot.usina.potenciaDcKwp / 1000).toFixed(3)} MWp`
  );
  doc.text(`Período: ${fmtData(snapshot.periodo.inicio)} a ${fmtData(snapshot.periodo.fim)}`);
  doc.text(`Responsável: ${snapshot.responsavel ?? "não informado"}`);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`);
  doc.moveDown(1.2);

  function secao(titulo: string) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COR_AZUL_MARINHO).text(titulo);
    doc.moveDown(0.3);
  }
  function linha(rotulo: string, valor: string) {
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(`${rotulo}: `, { continued: true }).font("Helvetica-Bold").text(valor);
  }

  secao("Geração de Energia");
  linha("Energia realizada", `${fmtNum(snapshot.geracao.realizadaKwh, 0)} kWh`);
  linha("Estimativa P50", `${fmtNum(snapshot.geracao.p50Kwh, 0)} kWh`);
  linha("Estimativa P90", `${fmtNum(snapshot.geracao.p90Kwh, 0)} kWh`);
  linha("Aderência à meta P50", fmtPct(snapshot.geracao.aderenciaP50Pct));
  linha("Aderência à meta P90", fmtPct(snapshot.geracao.aderenciaP90Pct));
  doc.moveDown(0.8);

  secao("Performance Ratio (PR)");
  linha("PR realizado", fmtPct(snapshot.pr.realizadoPct));
  linha("PR esperado", fmtPct(snapshot.pr.esperadoPct));
  linha("Aderência", fmtPct(snapshot.pr.aderenciaPct));
  doc.moveDown(0.8);

  secao("Fator de Capacidade (FC)");
  linha(`FC aferido (base ${snapshot.fc.baseUsada})`, fmtPct(snapshot.fc.aferidoPct));
  doc.moveDown(0.8);

  secao("Disponibilidade");
  linha("Disponibilidade de geração", fmtPct(snapshot.disponibilidade.geracaoPct));
  linha("Disponibilidade de comunicação", fmtPct(snapshot.disponibilidade.comunicacaoPct));
  linha("MTTR", snapshot.disponibilidade.mttrHoras !== null ? `${fmtNum(snapshot.disponibilidade.mttrHoras, 1)} h` : "Não calculável");
  linha("MTBF", snapshot.disponibilidade.mtbfHoras !== null ? `${fmtNum(snapshot.disponibilidade.mtbfHoras, 1)} h` : "Não calculável");
  doc.moveDown(0.8);

  secao("Financeiro — Custo de O&M");
  linha("Custo total", fmtMoeda(snapshot.financeiro.custoTotal));
  linha("Custo por kWp instalado", fmtMoeda(snapshot.financeiro.custoPorKwp));
  doc.moveDown(0.3);
  for (const [cat, valor] of Object.entries(snapshot.financeiro.custoPorCategoria)) {
    linha(`  ${ROTULO_CATEGORIA[cat] ?? cat}`, fmtMoeda(valor));
  }

  doc.moveDown(2);
  doc.font("Helvetica").fontSize(8).fillColor(COR_CINZA).text(
    "Relatório gerado a partir de uma fotografia dos dados no momento da emissão — reabrir este relatório sempre reproduz o mesmo conteúdo, mesmo que lançamentos tenham sido alterados depois.",
    { width: 495 }
  );

  return doc;
}

export async function gerarExcel(snapshot: RelatorioSnapshot): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet("Relatório");

  planilha.addRow(["OASIS SOLAR — Relatório de Desempenho da Usina"]).font = { bold: true, size: 14 };
  planilha.addRow(["Usina", snapshot.usina.nome]);
  planilha.addRow(["Localização", snapshot.usina.municipio ? `${snapshot.usina.municipio}/${snapshot.usina.uf}` : "não informada"]);
  planilha.addRow(["Potência DC", `${(snapshot.usina.potenciaDcKwp / 1000).toFixed(3)} MWp`]);
  planilha.addRow(["Período", `${fmtData(snapshot.periodo.inicio)} a ${fmtData(snapshot.periodo.fim)}`]);
  planilha.addRow(["Responsável", snapshot.responsavel ?? "não informado"]);
  planilha.addRow(["Emitido em", new Date().toLocaleString("pt-BR")]);
  planilha.addRow([]);

  const cabecalho = planilha.addRow(["Indicador", "Valor"]);
  cabecalho.font = { bold: true };

  const linhas: [string, string][] = [
    ["Energia realizada (kWh)", fmtNum(snapshot.geracao.realizadaKwh, 0)],
    ["Estimativa P50 (kWh)", fmtNum(snapshot.geracao.p50Kwh, 0)],
    ["Estimativa P90 (kWh)", fmtNum(snapshot.geracao.p90Kwh, 0)],
    ["Aderência à meta P50", fmtPct(snapshot.geracao.aderenciaP50Pct)],
    ["Aderência à meta P90", fmtPct(snapshot.geracao.aderenciaP90Pct)],
    ["PR realizado", fmtPct(snapshot.pr.realizadoPct)],
    ["PR esperado", fmtPct(snapshot.pr.esperadoPct)],
    ["Aderência PR", fmtPct(snapshot.pr.aderenciaPct)],
    [`FC aferido (base ${snapshot.fc.baseUsada})`, fmtPct(snapshot.fc.aferidoPct)],
    ["Disponibilidade de geração", fmtPct(snapshot.disponibilidade.geracaoPct)],
    ["Disponibilidade de comunicação", fmtPct(snapshot.disponibilidade.comunicacaoPct)],
    ["MTTR (h)", snapshot.disponibilidade.mttrHoras !== null ? fmtNum(snapshot.disponibilidade.mttrHoras, 1) : "Não calculável"],
    ["MTBF (h)", snapshot.disponibilidade.mtbfHoras !== null ? fmtNum(snapshot.disponibilidade.mtbfHoras, 1) : "Não calculável"],
    ["Custo total de O&M", fmtMoeda(snapshot.financeiro.custoTotal)],
    ["Custo por kWp instalado", fmtMoeda(snapshot.financeiro.custoPorKwp)],
  ];
  for (const [rotulo, valor] of linhas) planilha.addRow([rotulo, valor]);

  planilha.addRow([]);
  planilha.addRow(["Custo por categoria"]).font = { bold: true };
  for (const [cat, valor] of Object.entries(snapshot.financeiro.custoPorCategoria)) {
    planilha.addRow([ROTULO_CATEGORIA[cat] ?? cat, fmtMoeda(valor)]);
  }

  planilha.getColumn(1).width = 40;
  planilha.getColumn(2).width = 24;

  return workbook.xlsx.writeBuffer();
}

export function gerarCsv(snapshot: RelatorioSnapshot): string {
  const linhas: string[] = [];
  linhas.push(`"OASIS SOLAR — Relatório de Desempenho da Usina"`);
  linhas.push(`"Usina";"${snapshot.usina.nome}"`);
  linhas.push(`"Período";"${fmtData(snapshot.periodo.inicio)} a ${fmtData(snapshot.periodo.fim)}"`);
  linhas.push(`"Responsável";"${snapshot.responsavel ?? "não informado"}"`);
  linhas.push("");
  linhas.push(`"Indicador";"Valor"`);
  linhas.push(`"Energia realizada (kWh)";"${fmtNum(snapshot.geracao.realizadaKwh, 0)}"`);
  linhas.push(`"Estimativa P50 (kWh)";"${fmtNum(snapshot.geracao.p50Kwh, 0)}"`);
  linhas.push(`"Estimativa P90 (kWh)";"${fmtNum(snapshot.geracao.p90Kwh, 0)}"`);
  linhas.push(`"Aderência à meta P50";"${fmtPct(snapshot.geracao.aderenciaP50Pct)}"`);
  linhas.push(`"Aderência à meta P90";"${fmtPct(snapshot.geracao.aderenciaP90Pct)}"`);
  linhas.push(`"PR realizado";"${fmtPct(snapshot.pr.realizadoPct)}"`);
  linhas.push(`"PR esperado";"${fmtPct(snapshot.pr.esperadoPct)}"`);
  linhas.push(`"Aderência PR";"${fmtPct(snapshot.pr.aderenciaPct)}"`);
  linhas.push(`"FC aferido (base ${snapshot.fc.baseUsada})";"${fmtPct(snapshot.fc.aferidoPct)}"`);
  linhas.push(`"Disponibilidade de geração";"${fmtPct(snapshot.disponibilidade.geracaoPct)}"`);
  linhas.push(`"Disponibilidade de comunicação";"${fmtPct(snapshot.disponibilidade.comunicacaoPct)}"`);
  linhas.push(`"MTTR (h)";"${snapshot.disponibilidade.mttrHoras !== null ? fmtNum(snapshot.disponibilidade.mttrHoras, 1) : "Não calculável"}"`);
  linhas.push(`"MTBF (h)";"${snapshot.disponibilidade.mtbfHoras !== null ? fmtNum(snapshot.disponibilidade.mtbfHoras, 1) : "Não calculável"}"`);
  linhas.push(`"Custo total de O&M";"${fmtMoeda(snapshot.financeiro.custoTotal)}"`);
  linhas.push(`"Custo por kWp instalado";"${fmtMoeda(snapshot.financeiro.custoPorKwp)}"`);
  linhas.push("");
  linhas.push(`"Custo por categoria"`);
  for (const [cat, valor] of Object.entries(snapshot.financeiro.custoPorCategoria)) {
    linhas.push(`"${ROTULO_CATEGORIA[cat] ?? cat}";"${fmtMoeda(valor)}"`);
  }
  return "﻿" + linhas.join("\r\n");
}
