// Irradiação diária realizada (kWh/m²) a partir de "Geracao_M.xlsx" (2026-09-21): uma série única
// (Data, Irradiação) aplicada às usinas abaixo, que passam a usar essa tabela como irradiação.
// Grava LancamentoIrradiacaoDiaria no nível da usina (skidId nulo, plano POA), exatamente como o
// lançamento manual: dia novo -> cria; dia já lançado com valor diferente -> atualiza e registra o
// valor anterior na auditoria; valor igual -> não mexe. Nada é apagado.
//
// Sem --aplicar apenas simula. Uso: npx tsx prisma/importar_irradiacao_diaria_geracao_m.ts "<xlsx>" [--aplicar]

import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const CAMINHO = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const ORIGEM = "Importação — Geracao_M.xlsx";
// "UFV Efize" (pedido) é a "UFV Efizi" do cadastro.
const USINAS = ["UFV Cerado Pedra I", "UFV Cerado Pedra II", "UFV Cerado Pedra III", "UFV Bom Futuro", "UFV Efizi", "UFV Nacional I", "UFV Nacional II"];
const EPS = 1e-9;

async function lerSerie(caminho: string): Promise<{ dia: string; valor: number }[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(caminho);
  const ws = wb.worksheets[0];
  const serie: { dia: string; valor: number }[] = [];
  const vistos = new Set<string>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const data = ws.getRow(r).getCell(1).value;
    const valor = ws.getRow(r).getCell(2).value;
    if (data === null || data === undefined) continue;
    if (!(data instanceof Date) || typeof valor !== "number" || valor < 0) throw new Error(`Linha ${r} inválida: ${JSON.stringify([data, valor])}`);
    const dia = data.toISOString().slice(0, 10);
    if (vistos.has(dia)) throw new Error(`Data repetida na planilha: ${dia}`);
    vistos.add(dia);
    serie.push({ dia, valor });
  }
  return serie;
}

async function main() {
  if (!CAMINHO) throw new Error("Informe o caminho do xlsx.");
  const serie = await lerSerie(CAMINHO);
  console.log(`${APLICAR ? "APLICANDO" : "SIMULAÇÃO (nada será gravado)"} — ${serie.length} dias (${serie[0].dia} a ${serie[serie.length - 1].dia}), Σ ${serie.reduce((s, x) => s + x.valor, 0).toFixed(1)} kWh/m²\n`);

  const admin = await prisma.usuario.findFirst({ where: { perfil: "ADMIN" }, select: { id: true } });
  const inicio = new Date(`${serie[0].dia}T00:00:00.000Z`);
  const fim = new Date(`${serie[serie.length - 1].dia}T00:00:00.000Z`);

  for (const nome of USINAS) {
    const usina = await prisma.usina.findFirst({ where: { nome } });
    if (!usina) {
      console.log(`[NÃO ENCONTRADA] ${nome}`);
      continue;
    }
    const existentes = await prisma.lancamentoIrradiacaoDiaria.findMany({ where: { usinaId: usina.id, skidId: null, data: { gte: inicio, lte: fim } }, orderBy: { criadoEm: "asc" } });
    const porDia = new Map<string, (typeof existentes)[number]>();
    for (const e of existentes) if (!porDia.has(e.data.toISOString().slice(0, 10))) porDia.set(e.data.toISOString().slice(0, 10), e);

    const novos = serie.filter((s) => !porDia.has(s.dia));
    const alterados = serie.filter((s) => porDia.has(s.dia) && Math.abs(porDia.get(s.dia)!.irradiacaoKwhM2 - s.valor) > EPS);
    const iguais = serie.length - novos.length - alterados.length;
    console.log(
      `${nome}: ${novos.length} novos, ${alterados.length} atualizados${alterados.length ? ` (${alterados.map((a) => `${a.dia}: ${porDia.get(a.dia)!.irradiacaoKwhM2} -> ${a.valor}`).join("; ")})` : ""}, ${iguais} já iguais`,
    );
    if (!APLICAR) continue;

    await prisma.lancamentoIrradiacaoDiaria.createMany({
      data: novos.map((s) => ({ usinaId: usina.id, skidId: null, data: new Date(`${s.dia}T00:00:00.000Z`), irradiacaoKwhM2: s.valor, plano: usina.planoIrradiacao ?? "POA", origem: ORIGEM, criadoPorId: admin?.id ?? null })),
    });
    for (const a of alterados) {
      const atual = porDia.get(a.dia)!;
      await prisma.lancamentoIrradiacaoDiaria.update({ where: { id: atual.id }, data: { irradiacaoKwhM2: a.valor, origem: ORIGEM } });
      await prisma.logAuditoria.create({
        data: {
          usuarioId: admin?.id ?? null,
          usinaId: usina.id,
          modulo: "lancamentos",
          entidade: "LancamentoIrradiacaoDiaria",
          entidadeId: atual.id,
          acao: "EDICAO",
          campo: "irradiacaoKwhM2",
          valorAnterior: String(atual.irradiacaoKwhM2),
          valorNovo: String(a.valor),
          justificativa: `${ORIGEM} (${a.dia})`,
        },
      });
    }
    await prisma.logAuditoria.create({
      data: {
        usuarioId: admin?.id ?? null,
        usinaId: usina.id,
        modulo: "lancamentos",
        entidade: "LancamentoIrradiacaoDiaria",
        acao: "CRIACAO",
        justificativa: `${ORIGEM}: ${novos.length} dia(s) criados, ${alterados.length} atualizados (${serie[0].dia} a ${serie[serie.length - 1].dia})`,
      },
    });
  }
  console.log(APLICAR ? "\nConcluído." : "\nSimulação concluída — rode novamente com --aplicar para gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
