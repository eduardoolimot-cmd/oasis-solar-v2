// Gera pela linha de comando o mesmo .zip do botão "Gerar e baixar backup" (tela Administração):
// banco.db + uploads/ + LEIA-ME.txt. O arquivo pode ser enviado em Administração > "Restaurar backup".
//
// Uso (na pasta apps/api): npm run backup -- [pasta-de-destino]   (padrão: apps/api/backups)

import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BACKUPS_DIR, carimboAgora, gravarBackupEmArquivo } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const pasta = path.resolve(process.argv[2] ?? BACKUPS_DIR);
  fs.mkdirSync(pasta, { recursive: true });
  const destino = path.join(pasta, `oasis_solar_backup_${carimboAgora()}.zip`);
  await gravarBackupEmArquivo(destino, `linha de comando (${os.userInfo().username})`);
  console.log(`Backup gerado: ${destino} (${(fs.statSync(destino).size / (1024 * 1024)).toFixed(1)} MB)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
