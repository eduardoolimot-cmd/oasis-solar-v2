import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ZipArchive } from "archiver";
import JSZip from "jszip";
import { prisma } from "./prisma";
import { UPLOADS_DIR } from "./upload";

// Backup e restauração completos (banco SQLite + pasta de arquivos enviados).
//
// Formato do backup: um .zip com banco.db (cópia íntegra via "VACUUM INTO"), uploads/ e LEIA-ME.txt.
// A restauração aceita esse .zip (troca banco e arquivos) ou só um arquivo .db (troca só o banco).
// Antes de trocar qualquer coisa, o estado atual é salvo em backups/antes_da_restauracao_<data>.zip,
// que pode ser restaurado pela mesma tela para desfazer.

export const BACKUPS_DIR = path.resolve(__dirname, "..", "..", "backups");
export const TAMANHO_MAXIMO_RESTAURACAO_BYTES = 500 * 1024 * 1024;

/// Erro de validação mostrado ao administrador como está (resposta 400).
export class ErroRestauracao extends Error {}

export function caminhoBancoSqlite(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  // "file:./dev.db" é relativo à pasta prisma/ (onde está o schema).
  return path.resolve(__dirname, "..", "..", "prisma", url.slice("file:".length));
}

export function carimboAgora(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/// Cópia íntegra do banco em uso (funciona com o sistema rodando). Quem chama apaga a pasta.
export async function copiarBancoAtual(): Promise<{ pasta: string; arquivo: string }> {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-backup-"));
  const arquivo = path.join(pasta, "banco.db");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
  } catch (err) {
    fs.rmSync(pasta, { recursive: true, force: true });
    throw err;
  }
  return { pasta, arquivo };
}

export function montarZipBackup(copiaBanco: string, geradoPor: string): ZipArchive {
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.file(copiaBanco, { name: "banco.db" });
  if (fs.existsSync(UPLOADS_DIR)) zip.directory(UPLOADS_DIR, "uploads");
  zip.append(
    `OASIS SOLAR — backup gerado em ${new Date().toLocaleString("pt-BR")}\n` +
      `Gerado por: ${geradoPor}\n\n` +
      `banco.db  -> cópia íntegra do banco de dados (SQLite)\n` +
      `uploads/  -> fotos de usinas, de ordens de serviço e imagens de itens de estoque\n\n` +
      `Restauração: tela Administração > "Restaurar backup", enviando este .zip.\n` +
      `Manual: parar o sistema, substituir apps/api/prisma/dev.db por banco.db e a pasta apps/api/uploads pelo conteúdo de uploads/.\n`,
    { name: "LEIA-ME.txt" }
  );
  return zip;
}

/// Grava o backup completo num arquivo .zip (usado pelo backup de segurança e pela linha de comando).
export async function gravarBackupEmArquivo(destino: string, geradoPor: string): Promise<void> {
  const { pasta, arquivo } = await copiarBancoAtual();
  try {
    await new Promise<void>((resolve, reject) => {
      const saida = fs.createWriteStream(destino);
      const zip = montarZipBackup(arquivo, geradoPor);
      saida.on("close", resolve);
      saida.on("error", reject);
      zip.on("error", reject);
      zip.pipe(saida);
      void zip.finalize();
    });
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}

export function listarBackupsDeSeguranca(): { nome: string; tamanhoBytes: number; data: string }[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((nome) => nome.endsWith(".zip"))
    .map((nome) => {
      const info = fs.statSync(path.join(BACKUPS_DIR, nome));
      return { nome, tamanhoBytes: info.size, data: info.mtime.toISOString() };
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

/// Confere o banco enviado antes de usá-lo: integridade, mesma estrutura do sistema atual (toda tabela
/// e coluna que o sistema usa precisa existir) e pelo menos um administrador ativo.
async function validarBanco(arquivo: string): Promise<{ usuarios: number; usinas: number }> {
  const cliente = new PrismaClient({ datasourceUrl: `file:${arquivo.replace(/\\/g, "/")}` });
  try {
    let integridade: { integrity_check: string }[];
    try {
      integridade = await cliente.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    } catch {
      throw new ErroRestauracao("O arquivo enviado não é um banco de dados SQLite válido.");
    }
    if (integridade[0]?.integrity_check !== "ok") {
      throw new ErroRestauracao("O banco de dados enviado está corrompido (falhou na verificação de integridade).");
    }

    const tabelas = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'"
    );
    const faltando: string[] = [];
    for (const { name } of tabelas) {
      const colunasAtuais = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${name}")`);
      const colunasEnviadas = await cliente.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${name}")`);
      if (colunasEnviadas.length === 0) {
        faltando.push(`tabela ${name}`);
        continue;
      }
      const nomes = new Set(colunasEnviadas.map((c) => c.name));
      for (const c of colunasAtuais) if (!nomes.has(c.name)) faltando.push(`${name}.${c.name}`);
    }
    if (faltando.length) {
      const lista = faltando.slice(0, 8).join(", ") + (faltando.length > 8 ? ` e mais ${faltando.length - 8}` : "");
      throw new ErroRestauracao(
        `O backup é de uma versão diferente do sistema (faltam: ${lista}). Gere o backup a partir de um sistema na mesma versão deste.`
      );
    }

    const admins = await cliente.usuario.count({ where: { perfil: "ADMIN", ativo: true } });
    if (admins === 0) throw new ErroRestauracao("O banco enviado não tem nenhum administrador ativo — ninguém conseguiria entrar para administrá-lo.");
    return { usuarios: await cliente.usuario.count(), usinas: await cliente.usina.count() };
  } finally {
    await cliente.$disconnect();
  }
}

export interface ResultadoRestauracao {
  backupDeSeguranca: string;
  usuarios: number;
  usinas: number;
  /// null quando foi enviado só o .db (a pasta de arquivos não foi alterada).
  arquivosRestaurados: number | null;
}

/// Substitui o banco (e, se o .zip trouxer, a pasta de arquivos) pelo conteúdo do backup enviado.
export async function restaurarBackup(arquivoEnviado: string, geradoPor: string): Promise<ResultadoRestauracao> {
  const banco = caminhoBancoSqlite();
  if (!banco) throw new ErroRestauracao("Este ambiente usa PostgreSQL — a restauração pela interface só funciona com banco SQLite.");

  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-restauracao-"));
  try {
    const cabecalho = Buffer.alloc(16);
    const fd = fs.openSync(arquivoEnviado, "r");
    fs.readSync(fd, cabecalho, 0, 16, 0);
    fs.closeSync(fd);

    let novoBanco: string;
    let arquivos: { destino: string; entrada: JSZip.JSZipObject }[] | null = null;
    if (cabecalho.readUInt32LE(0) === 0x04034b50) {
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(fs.readFileSync(arquivoEnviado));
      } catch {
        throw new ErroRestauracao("Não foi possível abrir o arquivo .zip.");
      }
      const entradaBanco = zip.file("banco.db");
      if (!entradaBanco) throw new ErroRestauracao('O .zip não contém banco.db — use um arquivo gerado por "Gerar e baixar backup".');
      novoBanco = path.join(pasta, "banco.db");
      fs.writeFileSync(novoBanco, await entradaBanco.async("nodebuffer"));

      arquivos = [];
      for (const entrada of Object.values(zip.files)) {
        if (entrada.dir || !entrada.name.startsWith("uploads/")) continue;
        const destino = path.resolve(UPLOADS_DIR, entrada.name.slice("uploads/".length));
        if (!destino.startsWith(UPLOADS_DIR + path.sep)) throw new ErroRestauracao(`Caminho inválido dentro do .zip: ${entrada.name}`);
        arquivos.push({ destino, entrada });
      }
    } else if (cabecalho.toString("latin1") === "SQLite format 3\0") {
      novoBanco = arquivoEnviado;
    } else {
      throw new ErroRestauracao("Formato não reconhecido. Envie o .zip gerado pelo backup ou um arquivo de banco .db.");
    }

    const contagens = await validarBanco(novoBanco);

    // Backup de segurança do estado atual — daqui em diante nada foi alterado ainda.
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const nomeSeguranca = `antes_da_restauracao_${carimboAgora()}.zip`;
    await gravarBackupEmArquivo(path.join(BACKUPS_DIR, nomeSeguranca), `${geradoPor} (automático, antes da restauração)`);

    // Troca do banco: desconecta, remove journal/WAL do banco antigo (seriam aplicados ao novo) e troca
    // o arquivo por renomeação (as conexões antigas, se houver, continuam vendo o arquivo antigo).
    await prisma.$disconnect();
    const provisorio = `${banco}.restaurando`;
    fs.copyFileSync(novoBanco, provisorio);
    for (const sufixo of ["-journal", "-wal", "-shm"]) fs.rmSync(banco + sufixo, { force: true });
    fs.renameSync(provisorio, banco);

    if (arquivos) {
      fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      for (const { destino, entrada } of arquivos) {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, await entrada.async("nodebuffer"));
      }
    }

    return { backupDeSeguranca: nomeSeguranca, ...contagens, arquivosRestaurados: arquivos ? arquivos.length : null };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
