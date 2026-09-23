// Importa o histórico de manutenções de "manutencoes.csv" (2026-09-23) como Ordens de Serviço.
// Colunas: Usina;Tipo;Status;Título;Data;Vencimento;Responsável;Local/Componente;Detalhe (separador
// ";", campos entre aspas, "Detalhe" pode ter várias linhas).
//
// Mapeamento:
//   Tipo     Corretiva/Preventiva            -> tipo CORRETIVA/PREVENTIVA
//   Status   Concluída / Em Execução / Planejada -> CONCLUIDA / EM_ANDAMENTO / ABERTA
//   Data     -> dataPrevista (aparece no calendário); nas concluídas também dataConclusao
//   Responsável e Local/Componente -> ao fim da descrição (o campo responsavelId da OS aponta para um
//     usuário do sistema, e os responsáveis do arquivo são técnicos sem usuário)
//   SKID     -> só quando o Local cita exatamente um SKID que existe na usina; senão "Usina inteira"
// Nomes de usina do arquivo que diferem do cadastro são mapeados por uma tabela explícita (nada de
// "parecido"). Linha sem correspondência = importação cancelada.
//
// Sem --aplicar só simula. Reexecutar não duplica: OS igual (usina, tipo, título, data e descrição)
// já existente é pulada. Uso: npx tsx prisma/importar_manutencoes_csv.ts "<csv>" [--aplicar]

import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APLICAR = process.argv.includes("--aplicar");
const CAMINHO = process.argv.find((a, i) => i >= 2 && !a.startsWith("--"));
const ORIGEM = "Importado de manutencoes.csv em 2026-09-23.";

const NOMES_USINA: Record<string, string> = {
  "UFV Sítio do Pescoço": "UFV Sitio Pescoço",
  "UFV Cercado Pedra II": "UFV Cerado Pedra II",
  "UFV Cercado Pedra III": "UFV Cerado Pedra III",
  "UFV Partinga": "UFV Paratinga",
};

// Correções decididas com o cliente para linhas específicas (número da linha lógica do CSV, 1 = 1º registro).
// 2 e 6: marcadas "UFV Cerado Pedra I", mas o serviço (trackers Brametal, casquilhos/mancais) e o
// local ("PEDRO CANARIO I / II") são de Pedro Canário — confirmado pelo cliente. 29: data "0026-05-17"
// no arquivo; cliente confirmou 17/05/2026 (erro de digitação no ano).
const CORRECOES: Record<number, { usina?: string; data?: string }> = {
  2: { usina: "UFV Pedro Canário" },
  6: { usina: "UFV Pedro Canário" },
  29: { data: "2026-05-17" },
};

const STATUS: Record<string, string> = { "Concluída": "CONCLUIDA", "Em Execução": "EM_ANDAMENTO", "Planejada": "ABERTA" };
const TIPO: Record<string, string> = { Corretiva: "CORRETIVA", Preventiva: "PREVENTIVA" };

function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let entreAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreAspas = false;
      else campo += c;
    } else if (c === '"') entreAspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((v) => v !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((v) => v !== "")) linhas.push(linha);
  return linhas;
}

function dataValida(texto: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) && Number(texto.slice(0, 4)) >= 2000 ? texto : null;
}

async function main() {
  if (!CAMINHO) throw new Error("Informe o caminho do CSV.");
  const bruto = fs.readFileSync(CAMINHO, "utf8").replace(/^﻿/, "");
  const [cabecalho, ...registros] = lerCsv(bruto);
  const esperado = ["Usina", "Tipo", "Status", "Título", "Data", "Vencimento", "Responsável", "Local/Componente", "Detalhe"];
  if (cabecalho.join("|") !== esperado.join("|")) throw new Error(`Cabeçalho inesperado: ${cabecalho.join(" | ")}`);

  const usinas = await prisma.usina.findMany({ include: { skids: { where: { ativo: true }, select: { id: true, nome: true } } } });
  const admin = await prisma.usuario.findFirst({ where: { perfil: "ADMIN" }, select: { id: true } });

  const problemas: string[] = [];
  const planos = registros.map((r, idx) => {
    const n = idx + 1;
    if (r.length !== 9) problemas.push(`Registro ${n}: ${r.length} colunas (esperado 9).`);
    const [usinaCsv, tipoCsv, statusCsv, titulo, dataCsv, , responsavel, local, detalhe] = r.map((v) => v.trim());
    const correcao = CORRECOES[n] ?? {};
    const nomeUsina = correcao.usina ?? NOMES_USINA[usinaCsv] ?? usinaCsv;
    const usina = usinas.find((u) => u.nome === nomeUsina);
    if (!usina) problemas.push(`Registro ${n}: usina "${usinaCsv}" não encontrada no cadastro.`);
    const tipo = TIPO[tipoCsv];
    if (!tipo) problemas.push(`Registro ${n}: tipo "${tipoCsv}" desconhecido.`);
    const status = STATUS[statusCsv];
    if (!status) problemas.push(`Registro ${n}: status "${statusCsv}" desconhecido.`);
    const data = correcao.data ?? dataValida(dataCsv);

    const numerosSkid = [...new Set([...local.matchAll(/SKID\s*0?(\d+)/gi)].map((m) => Number(m[1])))];
    const skid = numerosSkid.length === 1 ? usina?.skids.find((s) => Number(s.nome.replace(/\D/g, "")) === numerosSkid[0]) ?? null : null;

    const descricao = [detalhe, "", responsavel ? `Responsável: ${responsavel}` : null, local ? `Local/Componente: ${local}` : null, ORIGEM]
      .filter((l): l is string => l !== null)
      .join("\n")
      .replace(/^\n+/, "");

    return { n, usinaCsv, usina, tipo, status, titulo, dataCsv, data, skid, local, descricao };
  });

  if (problemas.length) {
    console.log("IMPORTAÇÃO CANCELADA — corrija antes:\n" + problemas.join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`${APLICAR ? "APLICANDO" : "SIMULAÇÃO (nada será gravado)"} — ${planos.length} registros\n`);
  let criadas = 0;
  let puladas = 0;
  for (const p of planos) {
    const dataPrevista = p.data ? new Date(`${p.data}T00:00:00.000Z`) : null;
    const existente = await prisma.ordemServico.findFirst({
      where: { usinaId: p.usina!.id, tipo: p.tipo, titulo: p.titulo, dataPrevista, descricao: p.descricao },
      select: { id: true },
    });
    const aviso = p.data ? "" : `  [DATA INVÁLIDA "${p.dataCsv}" — sem data]`;
    console.log(
      `${String(p.n).padStart(2)} ${existente ? "JÁ EXISTE" : "nova     "} | ${p.usina!.nome.padEnd(20)} | ${p.tipo.padEnd(10)} | ${p.status.padEnd(12)} | ${p.data ?? "----------"} | ${(p.skid?.nome ?? "Usina inteira").padEnd(13)} | ${p.titulo}${aviso}`
    );
    if (existente) { puladas++; continue; }
    if (!APLICAR) continue;

    const os = await prisma.ordemServico.create({
      data: {
        usinaId: p.usina!.id,
        titulo: p.titulo,
        descricao: p.descricao,
        tipo: p.tipo,
        status: p.status,
        prioridade: "MEDIA",
        skidId: p.skid?.id ?? null,
        dataPrevista,
        dataConclusao: p.status === "CONCLUIDA" ? dataPrevista : null,
        criadoPorId: admin?.id ?? null,
      },
    });
    await prisma.logAuditoria.create({
      data: {
        usuarioId: admin?.id ?? null,
        usinaId: p.usina!.id,
        modulo: "manutencao",
        entidade: "OrdemServico",
        entidadeId: os.id,
        acao: "CRIACAO",
        justificativa: `Importação manutencoes.csv (registro ${p.n})`,
        valorNovo: JSON.stringify({ titulo: p.titulo, tipo: p.tipo, status: p.status, data: p.data }),
      },
    });
    criadas++;
  }
  console.log(`\n${APLICAR ? `Concluído: ${criadas} OS criadas` : "Simulação"}, ${puladas} já existiam.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
