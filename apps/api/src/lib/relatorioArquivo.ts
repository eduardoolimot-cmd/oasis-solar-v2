import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { ClimaRelatorio, RelatorioSnapshot } from "./relatorioSnapshot";

// Geração do arquivo (PDF/Excel/CSV) sempre a partir de um snapshot já gravado — nunca recalcula.
// Estrutura baseada no modelo "Relatório UFV Sítio do Pescoço": cabeçalho, Dados da instalação,
// Resumo operacional do mês, Geração de energia bruta e irradiação (gráfico diário com clima — só
// snapshots versão 3), Geração por SKID, Histórico de manutenção/ocorrências. A numeração das seções
// acompanha o que o snapshot tem. Poppins não está disponível como fonte embutida no gerador de PDF
// (sem .ttf no projeto) — Helvetica é usada até que a fonte oficial seja fornecida.

const AZUL = "#00386D";
const AZUL_CLARO_FUNDO = "#F1F6FB";
const AZUL_CLARO = "#45A3DB";
const LARANJA = "#EE7528";
const AMARELO = "#FBBB21";
const CINZA = "#878787";
const CINZA_NUVEM = "#9AA5B1";
const GRADE = "#E3E8EE";
const TEXTO = "#1F2933";
const TEXTO_SECUNDARIO = "#52606D";
const VERDE = "#16A34A";
const VERMELHO = "#DC2626";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const ROTULO_CLIMA: Record<ClimaRelatorio, string> = { SOL: "Sol", NUBLADO: "Nublado", CHUVA: "Chuva" };

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

/// Topo "redondo" do eixo (múltiplos que dividem bem em 4 faixas de grade).
function tetoDoEixo(v: number): number {
  if (v <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((m) => m * potencia >= v) ?? 10) * potencia;
}

function textoConclusao(s: RelatorioSnapshot): string {
  const v = variacaoPct(s.resumo.geracao.previstoKwh, s.resumo.geracao.realizadoKwh);
  if (v === null) return "Sem base de comparação (geração prevista ou realizada indisponível) para o período.";
  if (v >= -5) {
    return "A operação encontra-se monitorada e dentro dos parâmetros. Recomenda-se a continuidade do monitoramento preventivo para preservação da vida útil dos equipamentos.";
  }
  return "A geração realizada ficou abaixo do previsto para o período. Recomenda-se analisar as ocorrências e manutenções registradas neste relatório e as condições climáticas do mês.";
}

function totaisSkid(s: RelatorioSnapshot) {
  const previsto = s.skids.some((k) => k.previstoKwh !== null) ? s.skids.reduce((a, k) => a + (k.previstoKwh ?? 0), 0) : null;
  const realizado = s.skids.some((k) => k.realizadoKwh !== null) ? s.skids.reduce((a, k) => a + (k.realizadoKwh ?? 0), 0) : null;
  return { previsto, realizado };
}

function resumoClima(diario: NonNullable<RelatorioSnapshot["diario"]>): string {
  const conta = (c: ClimaRelatorio) => diario.filter((d) => d.clima === c).length;
  const semDado = diario.filter((d) => d.clima === null).length;
  if (semDado === diario.length) return "Sem dados meteorológicos para o período (coordenadas da usina não cadastradas ou fonte indisponível).";
  const chuva = diario.reduce((a, d) => a + (d.chuvaMm ?? 0), 0);
  return (
    `Clima no período: ${conta("SOL")} dia(s) de sol, ${conta("NUBLADO")} nublado(s) e ${conta("CHUVA")} com chuva (${fmtNum(chuva, 1)} mm acumulados)` +
    `${semDado ? `; ${semDado} dia(s) sem dado meteorológico` : ""}. Dia de chuva = precipitação de 1 mm ou mais (destacado em azul claro). Fonte: Open-Meteo.`
  );
}

export function gerarPdf(s: RelatorioSnapshot): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
  const larguraPagina = 595.28;
  const margem = 50;
  const larguraUtil = larguraPagina - margem * 2;
  const limite = 785;
  let numeroSecao = 1;

  // Cabeçalho
  doc.rect(0, 0, larguraPagina, 105).fill(AZUL);
  doc.rect(0, 105, larguraPagina, 3).fill(LARANJA);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("RELATÓRIO DE GERAÇÃO SOLAR", margem, 32, { width: larguraUtil });
  doc.font("Helvetica").fontSize(11).text(s.usina.nome, margem, 66, { width: larguraUtil });
  doc.font("Helvetica-Bold").fontSize(12).text(rotuloPeriodo(s.periodo.inicio, s.periodo.fim), margem, 66, { width: larguraUtil, align: "right" });
  doc.y = 130;

  function novaPagina() {
    doc.addPage({ size: "A4", margin: 0 });
    doc.y = 50;
  }

  function garantirEspaco(altura: number) {
    if (doc.y + altura > limite) novaPagina();
  }

  function secao(titulo: string, alturaMinima = 60) {
    garantirEspaco(alturaMinima);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(AZUL).text(`${numeroSecao++}. ${titulo}`, margem, doc.y, { width: larguraUtil });
    doc.moveDown(0.3);
    doc.strokeColor(AZUL).lineWidth(0.8).moveTo(margem, doc.y).lineTo(margem + larguraUtil, doc.y).stroke();
    doc.y += 10;
  }

  function parChaveValor(x: number, y: number, rotulo: string, valor: string, larguraRotulo = 75) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(TEXTO).text(`${rotulo}:`, x, y, { width: larguraRotulo, lineBreak: false });
    doc.font("Helvetica").text(valor, x + larguraRotulo, y, { width: larguraUtil / 2 - larguraRotulo - 6, lineBreak: false });
  }

  /// Tabela de linhas de altura fixa. "cor" recebe o índice da linha, ou -1 na linha de rodapé.
  function tabela(colunas: { titulo: string; largura: number; alinhar?: "left" | "right"; cor?: (indice: number) => string | undefined }[], linhas: string[][], rodape?: string[]) {
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
      if (doc.y + alturaLinha > limite) {
        novaPagina();
        cabecalho();
      }
      const y = doc.y;
      if (destaque) doc.rect(margem, y, larguraUtil, alturaLinha).fill("#E4EEF8");
      else if (indice % 2 === 0) doc.rect(margem, y, larguraUtil, alturaLinha).fill(AZUL_CLARO_FUNDO);
      let x = margem;
      colunas.forEach((c, k) => {
        const cor = c.cor?.(destaque ? -1 : indice) ?? (destaque ? AZUL : TEXTO);
        doc.font(destaque || k === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(cor);
        doc.text(valores[k], x + 6, y + 6, { width: c.largura - 12, align: c.alinhar ?? "left", lineBreak: false, ellipsis: true });
        x += c.largura;
      });
      doc.y = y + alturaLinha;
    }
    // Tabela que cabe numa página não é partida (evita o TOTAL sozinho na página seguinte).
    const alturaTotal = alturaLinha * (linhas.length + (rodape ? 2 : 1));
    if (alturaTotal < limite - 50) garantirEspaco(alturaTotal);
    cabecalho();
    linhas.forEach((l, i) => desenharLinha(l, i));
    if (rodape) desenharLinha(rodape, 0, true);
    doc.y += 14;
  }

  // ---- Ícones de clima (vetoriais) ----
  function iconeSol(cx: number, cy: number) {
    doc.save().strokeColor(LARANJA).lineWidth(0.7);
    for (let a = 0; a < 8; a++) {
      const angulo = (a * Math.PI) / 4;
      doc.moveTo(cx + Math.cos(angulo) * 3.6, cy + Math.sin(angulo) * 3.6).lineTo(cx + Math.cos(angulo) * 5.2, cy + Math.sin(angulo) * 5.2).stroke();
    }
    doc.circle(cx, cy, 2.8).fill(AMARELO).restore();
  }
  function iconeNuvem(cx: number, cy: number, cor: string) {
    doc.save().fillColor(cor);
    doc.circle(cx - 2.3, cy + 0.6, 2.2).fill();
    doc.circle(cx + 0.4, cy - 0.8, 2.9).fill();
    doc.circle(cx + 2.8, cy + 0.8, 2.0).fill();
    doc.rect(cx - 2.3, cy + 0.6, 5.1, 2.2).fill();
    doc.restore();
  }
  function iconeChuva(cx: number, cy: number) {
    iconeNuvem(cx, cy - 1.6, AZUL_CLARO);
    doc.save().strokeColor(AZUL).lineWidth(0.7);
    for (const dx of [-2.2, 0.4, 3]) doc.moveTo(cx + dx, cy + 2.4).lineTo(cx + dx - 0.9, cy + 4.6).stroke();
    doc.restore();
  }
  function iconeClima(clima: ClimaRelatorio | null, cx: number, cy: number) {
    if (clima === "SOL") iconeSol(cx, cy);
    else if (clima === "NUBLADO") iconeNuvem(cx, cy, CINZA_NUVEM);
    else if (clima === "CHUVA") iconeChuva(cx, cy);
    else doc.save().strokeColor("#C5CDD6").lineWidth(0.8).moveTo(cx - 2.5, cy).lineTo(cx + 2.5, cy).stroke().restore();
  }

  /// Gráfico diário: barras = geração realizada; tracejado = geração prevista (PVsyst, ajustada pela
  /// degradação); linha = irradiação (eixo direito); faixa superior = clima de cada dia.
  function graficoDiario(diario: NonNullable<RelatorioSnapshot["diario"]>) {
    garantirEspaco(262);
    const topo = doc.y;
    const x0 = margem + 44;
    const x1 = margem + larguraUtil - 40;
    const yIcones = topo + 6;
    const yTopo = topo + 36;
    const yBase = yTopo + 160;
    const n = diario.length;
    const slot = (x1 - x0) / n;
    const larguraBarra = Math.min(slot * 0.62, 14);
    const maxEnergia = tetoDoEixo(Math.max(1, ...diario.map((d) => Math.max(d.energiaKwh ?? 0, d.previstaKwh ?? 0))) * 1.05);
    const maxIrradiacao = tetoDoEixo(Math.max(1, ...diario.map((d) => d.irradiacaoKwhM2 ?? 0)) * 1.05);
    const yEnergia = (v: number) => yBase - (v / maxEnergia) * (yBase - yTopo);
    const yIrradiacao = (v: number) => yBase - (v / maxIrradiacao) * (yBase - yTopo);
    const centro = (i: number) => x0 + slot * i + slot / 2;

    doc.font("Helvetica").fontSize(7).fillColor(CINZA);
    doc.text("kWh/dia", margem, yTopo - 12, { width: 60, lineBreak: false });
    doc.text("kWh/m²", x1 + 4, yTopo - 12, { width: 40, lineBreak: false });

    for (let k = 0; k <= 4; k++) {
      const y = yBase - (k / 4) * (yBase - yTopo);
      doc.strokeColor(GRADE).lineWidth(0.5).moveTo(x0, y).lineTo(x1, y).stroke();
      doc.font("Helvetica").fontSize(6.5).fillColor(CINZA);
      doc.text(fmtNum((maxEnergia * k) / 4), margem, y - 3, { width: 40, align: "right", lineBreak: false });
      doc.text(fmtNum((maxIrradiacao * k) / 4, maxIrradiacao < 20 ? 1 : 0), x1 + 4, y - 3, { width: 36, lineBreak: false });
    }

    doc.font("Helvetica").fontSize(6).fillColor(CINZA).text("Clima", margem, yIcones - 3, { width: 40, align: "right", lineBreak: false });
    diario.forEach((d, i) => iconeClima(d.clima, centro(i), yIcones));
    diario.forEach((d, i) => {
      if (d.clima === "CHUVA") doc.save().fillColor(AZUL_CLARO).fillOpacity(0.1).rect(x0 + slot * i, yTopo, slot, yBase - yTopo).fill().restore();
    });

    diario.forEach((d, i) => {
      if (d.energiaKwh === null) return;
      const y = yEnergia(d.energiaKwh);
      doc.roundedRect(centro(i) - larguraBarra / 2, y, larguraBarra, yBase - y, 1.5).fill(AZUL);
    });

    function polilinha(valores: (number | null)[], y: (v: number) => number) {
      let aberta = false;
      valores.forEach((v, i) => {
        if (v === null) {
          aberta = false;
          return;
        }
        if (aberta) doc.lineTo(centro(i), y(v));
        else doc.moveTo(centro(i), y(v));
        aberta = true;
      });
      doc.stroke();
    }
    doc.save().strokeColor(LARANJA).lineWidth(1.3).dash(3, { space: 2 });
    polilinha(diario.map((d) => d.previstaKwh), yEnergia);
    doc.undash().restore();
    doc.save().strokeColor(AZUL_CLARO).lineWidth(1.4);
    polilinha(diario.map((d) => d.irradiacaoKwhM2), yIrradiacao);
    doc.restore();
    diario.forEach((d, i) => {
      if (d.irradiacaoKwhM2 !== null) doc.circle(centro(i), yIrradiacao(d.irradiacaoKwhM2), 1.3).fill(AZUL_CLARO);
    });

    doc.strokeColor("#C5CDD6").lineWidth(0.6).moveTo(x0, yBase).lineTo(x1, yBase).stroke();
    doc.font("Helvetica").fontSize(6).fillColor(CINZA);
    diario.forEach((d, i) => doc.text(String(Number(d.data.slice(8))), centro(i) - 6, yBase + 4, { width: 12, align: "center", lineBreak: false }));

    let xLegenda = margem;
    const yLegenda = yBase + 22;
    function itemLegenda(desenho: () => void, texto: string, largura: number) {
      desenho();
      doc.font("Helvetica").fontSize(7.5).fillColor(TEXTO).text(texto, xLegenda + 14, yLegenda - 3.5, { width: largura, lineBreak: false });
      xLegenda += largura + 18;
    }
    itemLegenda(() => doc.rect(xLegenda, yLegenda - 4, 10, 8).fill(AZUL), "Geração realizada", 70);
    itemLegenda(
      () => doc.save().strokeColor(LARANJA).lineWidth(1.3).dash(3, { space: 2 }).moveTo(xLegenda, yLegenda).lineTo(xLegenda + 10, yLegenda).stroke().undash().restore(),
      "Geração prevista (PVsyst)",
      98
    );
    itemLegenda(() => doc.save().strokeColor(AZUL_CLARO).lineWidth(1.4).moveTo(xLegenda, yLegenda).lineTo(xLegenda + 10, yLegenda).stroke().restore(), "Irradiação", 42);
    itemLegenda(() => iconeSol(xLegenda + 5, yLegenda), ROTULO_CLIMA.SOL, 14);
    itemLegenda(() => iconeNuvem(xLegenda + 5, yLegenda, CINZA_NUVEM), ROTULO_CLIMA.NUBLADO, 32);
    itemLegenda(() => iconeChuva(xLegenda + 5, yLegenda), ROTULO_CLIMA.CHUVA, 24);

    doc.font("Helvetica").fontSize(8).fillColor(CINZA).text(resumoClima(diario), margem, yLegenda + 14, { width: larguraUtil });
    doc.y = yLegenda + 40;
  }

  /// Histórico de manutenção: linhas de altura variável (texto quebra, nada é cortado).
  function tabelaManutencao() {
    const colunas = [
      { titulo: "Data", largura: 64 },
      { titulo: "Tipo / status", largura: 72 },
      { titulo: "Local", largura: 62 },
      { titulo: "Descrição", largura: larguraUtil - 64 - 72 - 62 - 92 },
      { titulo: "Responsável", largura: 92 },
    ];
    const padding = 7;
    const largura = (k: number) => colunas[k].largura - padding * 2;
    function cabecalho() {
      const y = doc.y;
      doc.rect(margem, y, larguraUtil, 20).fill(AZUL);
      let x = margem;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
      for (const c of colunas) {
        doc.text(c.titulo, x + padding, y + 6, { width: c.largura - padding * 2, lineBreak: false });
        x += c.largura;
      }
      doc.y = y + 20;
    }
    garantirEspaco(70);
    cabecalho();
    s.manutencao.forEach((m, i) => {
      const local = m.local ?? "—";
      const responsavel = m.responsavel ?? "—";
      const alturaTitulo = doc.font("Helvetica-Bold").fontSize(8.5).heightOfString(m.titulo, { width: largura(3) });
      const alturaDetalhe = m.detalhe ? doc.font("Helvetica").fontSize(7.5).heightOfString(m.detalhe, { width: largura(3) }) + 2 : 0;
      const alturaLocal = doc.font("Helvetica").fontSize(8.5).heightOfString(local, { width: largura(2) });
      const alturaResponsavel = doc.font("Helvetica").fontSize(8.5).heightOfString(responsavel, { width: largura(4) });
      const altura = Math.max(alturaTitulo + alturaDetalhe, alturaLocal, alturaResponsavel, 22) + padding * 2;
      if (doc.y + altura > limite) {
        novaPagina();
        cabecalho();
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(margem, y, larguraUtil, altura).fill(AZUL_CLARO_FUNDO);
      doc.strokeColor(GRADE).lineWidth(0.5).moveTo(margem, y + altura).lineTo(margem + larguraUtil, y + altura).stroke();

      let x = margem;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXTO).text(fmtData(m.data), x + padding, y + padding, { width: largura(0) });
      x += colunas[0].largura;
      const corTipo = m.tipo === "Corretiva" ? LARANJA : m.tipo === "Preventiva" ? AZUL : CINZA;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(corTipo).text(m.tipo, x + padding, y + padding, { width: largura(1) });
      if (m.status) doc.font("Helvetica").fontSize(7.5).fillColor(CINZA).text(m.status, x + padding, y + padding + 11, { width: largura(1) });
      x += colunas[1].largura;
      doc.font("Helvetica").fontSize(8.5).fillColor(TEXTO).text(local, x + padding, y + padding, { width: largura(2) });
      x += colunas[2].largura;
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(TEXTO).text(m.titulo, x + padding, y + padding, { width: largura(3) });
      if (m.detalhe) doc.font("Helvetica").fontSize(7.5).fillColor(TEXTO_SECUNDARIO).text(m.detalhe, x + padding, y + padding + alturaTitulo + 2, { width: largura(3) });
      x += colunas[3].largura;
      doc.font("Helvetica").fontSize(8.5).fillColor(TEXTO).text(responsavel, x + padding, y + padding, { width: largura(4) });
      doc.y = y + altura;
    });
    doc.y += 14;
  }

  // Dados da instalação
  secao("DADOS DA INSTALAÇÃO");
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

  // Resumo operacional
  secao("RESUMO OPERACIONAL DO MÊS");
  const vGer = variacaoPct(s.resumo.geracao.previstoKwh, s.resumo.geracao.realizadoKwh);
  const vIrr = variacaoPct(s.resumo.irradiacao.previstoKwhM2, s.resumo.irradiacao.realizadoKwhM2);
  const vPr =
    s.resumo.pr.previstoPct !== null && s.resumo.pr.realizadoPct !== null ? s.resumo.pr.realizadoPct - s.resumo.pr.previstoPct : null;
  tabela(
    [
      { titulo: "Indicador", largura: 175 },
      { titulo: "Previsto", largura: 105 },
      { titulo: "Realizado", largura: 105 },
      { titulo: "Variação", largura: larguraUtil - 385, cor: (i) => corVariacao([vGer, vIrr, vPr][i] ?? null) },
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
  if (!s.diario) {
    // Snapshot sem série diária (versão 2): o clima continua como linha de texto.
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
  }

  // Geração de energia bruta e irradiação (versão 3)
  if (s.diario && s.diario.length > 0) {
    secao("GERAÇÃO DE ENERGIA BRUTA E IRRADIAÇÃO", 280);
    graficoDiario(s.diario);
  }

  // Geração por SKID — o título só fica na página se a tabela inteira (curta) couber junto.
  secao("GERAÇÃO POR SKID", Math.min(40 + 20 * (s.skids.length + 2), limite - 100));
  const total = totaisSkid(s);
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
        {
          titulo: "Variação",
          largura: larguraUtil - 430,
          cor: (i) => corVariacao(i === -1 ? variacaoPct(total.previsto, total.realizado) : variacoesSkid[i] ?? null),
        },
      ],
      s.skids.map((k, i) => [k.nome, k.uc ?? "N/D", fmtNum(k.previstoKwh), fmtNum(k.realizadoKwh), fmtVariacao(variacoesSkid[i])]),
      ["TOTAL DA USINA", "", fmtNum(total.previsto), fmtNum(total.realizado), fmtVariacao(variacaoPct(total.previsto, total.realizado))]
    );
  }

  // Histórico de manutenção / ocorrências
  secao("HISTÓRICO DE MANUTENÇÃO / OCORRÊNCIAS", 90);
  if (s.manutencao.length === 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor(CINZA).text("Nenhuma manutenção ou ocorrência registrada no período.", margem, doc.y);
    doc.y += 14;
  } else {
    tabelaManutencao();
  }

  // Conclusão
  const textoFinal = textoConclusao(s);
  const alturaCaixa = doc.font("Helvetica").fontSize(9.5).heightOfString(textoFinal, { width: larguraUtil - 24 }) + 16;
  garantirEspaco(alturaCaixa + 4);
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
  const total = totaisSkid(s);
  let numero = 1;
  const titulo = (t: string) => [`${numero++}. ${t}`];

  const linhas: (string | number)[][] = [
    ["RELATÓRIO DE GERAÇÃO SOLAR", s.usina.nome, rotuloPeriodo(s.periodo.inicio, s.periodo.fim)],
    [],
    titulo("DADOS DA INSTALAÇÃO"),
    ["Instalação", s.usina.nome],
    ["Início da operação", s.usina.inicioOperacao ? fmtData(s.usina.inicioOperacao) : "N/D"],
    ["Potência (kWp)", fmtNum(s.usina.potenciaDcKwp)],
    ["Localização", s.usina.latitude !== null && s.usina.longitude !== null ? `${s.usina.latitude}, ${s.usina.longitude}` : "N/D"],
    ["Módulos", s.usina.totalModulos !== null ? fmtNum(s.usina.totalModulos) : "N/D"],
    ["Inversores", s.usina.totalInversores > 0 ? fmtNum(s.usina.totalInversores) : "N/D"],
    [],
    titulo("RESUMO OPERACIONAL DO MÊS"),
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
  ];

  if (s.diario && s.diario.length > 0) {
    linhas.push(
      titulo("GERAÇÃO DE ENERGIA BRUTA E IRRADIAÇÃO"),
      ["Data", "Geração realizada (kWh)", "Geração prevista PVsyst (kWh)", "Irradiação (kWh/m²)", "Clima", "Chuva (mm)"],
      ...s.diario.map((d) => [
        fmtData(`${d.data}T00:00:00Z`),
        fmtNum(d.energiaKwh),
        fmtNum(d.previstaKwh),
        fmtNum(d.irradiacaoKwhM2, 2),
        d.clima ? ROTULO_CLIMA[d.clima] : "N/D",
        fmtNum(d.chuvaMm, 1),
      ]),
      []
    );
  }

  linhas.push(
    titulo("GERAÇÃO POR SKID"),
    ["SKID", "UC", "Previsto (kWh)", "Realizado (kWh)", "Variação"],
    ...s.skids.map((k) => [k.nome, k.uc ?? "N/D", fmtNum(k.previstoKwh), fmtNum(k.realizadoKwh), fmtVariacao(variacaoPct(k.previstoKwh, k.realizadoKwh))]),
    ["TOTAL DA USINA", "", fmtNum(total.previsto), fmtNum(total.realizado), fmtVariacao(variacaoPct(total.previsto, total.realizado))],
    [],
    titulo("HISTÓRICO DE MANUTENÇÃO / OCORRÊNCIAS"),
    ["Data", "Tipo", "Status", "Local", "Título", "Detalhe", "Responsável"],
    ...s.manutencao.map((m) => [fmtData(m.data), m.tipo, m.status ?? "—", m.local ?? "—", m.titulo, m.detalhe ?? "—", m.responsavel ?? "—"])
  );
  return linhas;
}

export async function gerarExcel(s: RelatorioSnapshot): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const planilha = workbook.addWorksheet("Relatório");
  for (const linha of linhasPlanas(s)) {
    const row = planilha.addRow(linha);
    const primeira = String(linha[0] ?? "");
    if (/^\d\. /.test(primeira) || primeira.startsWith("RELATÓRIO")) row.font = { bold: true, color: { argb: "FF00386D" } };
    if (["Indicador", "SKID", "Data"].includes(primeira) || primeira.startsWith("TOTAL")) row.font = { bold: true };
  }
  [24, 26, 28, 22, 34, 60, 24].forEach((largura, i) => (planilha.getColumn(i + 1).width = largura));
  return workbook.xlsx.writeBuffer();
}

export function gerarCsv(s: RelatorioSnapshot): string {
  const linhas = linhasPlanas(s).map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"));
  return "\uFEFF" + linhas.join("\r\n");
}
