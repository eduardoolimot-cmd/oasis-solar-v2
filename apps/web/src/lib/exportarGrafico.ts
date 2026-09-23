// Exporta um gráfico do Recharts (SVG + legenda em HTML) como imagem PNG: recompõe título, gráfico
// e legenda num canvas com fundo branco, em resolução 2x. Só usa o que já está renderizado na tela
// (nada é recalculado nem enviado a nenhum servidor).

const FONTE = "Poppins, Arial, sans-serif";
const ESCALA = 2;

function corDoIcone(item: Element): string {
  const forma = item.querySelector("svg path, svg line, svg rect");
  const preenchimento = forma?.getAttribute("fill");
  if (preenchimento && preenchimento !== "none") return preenchimento;
  return forma?.getAttribute("stroke") ?? "#878787";
}

export async function exportarGraficoPng(container: HTMLElement, titulo: string, nomeArquivo: string): Promise<void> {
  // Filho direto do wrapper: os ícones da legenda também são <svg class="recharts-surface"> e
  // podem aparecer antes do gráfico na ordem do DOM.
  const svg = container.querySelector<SVGSVGElement>(".recharts-wrapper > svg.recharts-surface");
  if (!svg) throw new Error("Gráfico não encontrado.");

  const { width: largura, height: altura } = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(largura));
  clone.setAttribute("height", String(altura));
  clone.setAttribute("style", `font-family: ${FONTE}`);
  const marcado = new XMLSerializer().serializeToString(clone);

  const imagem = new Image();
  const url = URL.createObjectURL(new Blob([marcado], { type: "image/svg+xml;charset=utf-8" }));
  await new Promise<void>((resolve, reject) => {
    imagem.onload = () => resolve();
    imagem.onerror = () => reject(new Error("Não foi possível renderizar o gráfico."));
    imagem.src = url;
  });

  const itensLegenda = [...container.querySelectorAll(".recharts-legend-item")].map((item) => ({
    texto: item.textContent ?? "",
    cor: corDoIcone(item),
  }));

  const alturaTitulo = 44;
  const alturaLegenda = itensLegenda.length ? 34 : 8;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * ESCALA);
  canvas.height = Math.round((alturaTitulo + altura + alturaLegenda) * ESCALA);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, largura, alturaTitulo + altura + alturaLegenda);

  ctx.fillStyle = "#00386D";
  ctx.font = `600 15px ${FONTE}`;
  ctx.textBaseline = "middle";
  ctx.fillText(titulo, 16, alturaTitulo / 2 + 4);

  ctx.drawImage(imagem, 0, alturaTitulo, largura, altura);
  URL.revokeObjectURL(url);

  if (itensLegenda.length) {
    ctx.font = `12px ${FONTE}`;
    const larguras = itensLegenda.map((i) => 22 + ctx.measureText(i.texto).width + 18);
    let x = Math.max(16, (largura - larguras.reduce((a, b) => a + b, 0)) / 2);
    const y = alturaTitulo + altura + alturaLegenda / 2;
    itensLegenda.forEach((item, i) => {
      ctx.fillStyle = item.cor;
      ctx.fillRect(x, y - 5, 14, 10);
      ctx.fillStyle = "#333333";
      ctx.fillText(item.texto, x + 20, y);
      x += larguras[i];
    });
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Não foi possível gerar a imagem.");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeArquivo.endsWith(".png") ? nomeArquivo : `${nomeArquivo}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
