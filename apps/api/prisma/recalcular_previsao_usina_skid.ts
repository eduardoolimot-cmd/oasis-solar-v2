// Recalcula a previsão mensal da usina (Geração prevista PVsyst, irradiação e PR previstos) a partir
// dos "Dados mensais por SKID" já cadastrados, com as regras de src/lib/previsaoUsinaSkid.ts.
// Corrige usinas cuja previsão ficou diferente do cadastro por SKID (ex.: SKID sem potência FV, que
// a regra antiga descartava, mantendo o valor da importação da planilha).
//
// Só grava nova versão para usina/ano em que algo muda (versões anteriores preservadas). P50/P90 e
// metas de disponibilidade não são alterados. Sem --aplicar só simula. --usina "Nome" (repetível)
// limita às usinas indicadas.
// Uso: npx tsx prisma/recalcular_previsao_usina_skid.ts [--usina "UFV X"]... [--aplicar]

import { calcularPrevisaoUsinaPorSkid, recalcularPrevisaoUsina } from "../src/lib/previsaoUsinaSkid";
import { prisma } from "../src/lib/prisma";

const APLICAR = process.argv.includes("--aplicar");
const USINAS = process.argv.flatMap((a, i, todos) => (a === "--usina" && todos[i + 1] ? [todos[i + 1]] : []));
const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

async function main() {
  const admin = await prisma.usuario.findFirst({ where: { perfil: "ADMIN" }, select: { id: true } });
  const pares = await prisma.previsaoMensalSkid.findMany({ where: { ativo: true }, distinct: ["usinaId", "ano"], select: { usinaId: true, ano: true, usina: { select: { nome: true } } } });
  pares.sort((a, b) => a.usina.nome.localeCompare(b.usina.nome) || a.ano - b.ano);
  const naoEncontradas = USINAS.filter((n) => !pares.some((p) => p.usina.nome === n));
  if (naoEncontradas.length) throw new Error(`Usina sem dados por SKID ou nome inexistente: ${naoEncontradas.join(", ")}`);
  if (USINAS.length) pares.splice(0, pares.length, ...pares.filter((p) => USINAS.includes(p.usina.nome)));

  console.log(`${APLICAR ? "APLICANDO" : "SIMULAÇÃO (nada será gravado)"}\n`);
  let alteradas = 0;
  for (const { usinaId, ano, usina } of pares) {
    const { mudancas } = await calcularPrevisaoUsinaPorSkid(usinaId, ano);
    if (!mudancas.length) {
      console.log(`${usina.nome} ${ano}: sem mudança`);
      continue;
    }
    alteradas++;
    console.log(`${usina.nome} ${ano}: ${mudancas.length} valor(es) mudam`);
    for (const m of mudancas) console.log(`   mês ${String(m.mes).padStart(2)} ${m.campo.padEnd(24)} ${fmt(m.anterior)} -> ${fmt(m.novo)}`);
    if (APLICAR) {
      const versao = await recalcularPrevisaoUsina(usinaId, ano, admin?.id ?? null, "Recálculo pelos dados mensais por SKID (correção: SKID sem potência FV era descartado)");
      console.log(`   gravada versão ${versao}`);
    }
  }
  console.log(`\n${alteradas} usina(s)/ano com mudança${APLICAR ? " — gravadas" : ""}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
