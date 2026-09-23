import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZipArchive } from "archiver";
import { Router } from "express";
import { registrarAuditoria } from "../../lib/auditoria";
import { prisma } from "../../lib/prisma";
import { UPLOADS_DIR } from "../../lib/upload";
import { autenticar, exigirAdmin } from "../../middleware/auth";

// Área exclusiva do administrador. Hoje: backup completo dos dados.
//
// Backup = um .zip com (1) uma cópia consistente do banco de dados e (2) a pasta de arquivos
// enviados (fotos de usinas e imagens de itens de estoque). No banco SQLite de desenvolvimento a
// cópia é feita com "VACUUM INTO" (cópia íntegra mesmo com o sistema em uso). Em produção com
// PostgreSQL o backup do banco é feito com pg_dump no servidor — ver docs/DECISOES_PLACEHOLDER.md.

const router = Router();
router.use(autenticar, exigirAdmin);

function caminhoBancoSqlite(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  // "file:./dev.db" é relativo à pasta prisma/ (onde está o schema).
  return path.resolve(__dirname, "..", "..", "..", "prisma", url.slice("file:".length));
}

router.get("/backup/info", async (_req, res) => {
  const banco = caminhoBancoSqlite();
  const tamanhoBanco = banco && fs.existsSync(banco) ? fs.statSync(banco).size : null;
  const arquivos = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR).length : 0;
  const ultimo = await prisma.logAuditoria.findFirst({
    where: { modulo: "administracao", entidade: "Backup" },
    orderBy: { criadoEm: "desc" },
    include: { usuario: { select: { nome: true } } },
  });
  res.json({
    tipoBanco: banco ? "SQLite" : "PostgreSQL",
    backupDoBancoPelaInterface: banco !== null,
    tamanhoBancoBytes: tamanhoBanco,
    arquivosEnviados: arquivos,
    ultimoBackup: ultimo ? { data: ultimo.criadoEm, usuario: ultimo.usuario?.nome ?? null } : null,
  });
});

router.get("/backup", async (req, res) => {
  const banco = caminhoBancoSqlite();
  if (!banco) {
    return res.status(501).json({
      erro: "Este ambiente usa PostgreSQL — o backup do banco deve ser feito com pg_dump no servidor. A interface só gera backup do banco SQLite de desenvolvimento.",
    });
  }

  const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-backup-"));
  const copiaBanco = path.join(pastaTemporaria, "banco.db");
  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${copiaBanco.replace(/'/g, "''")}'`);
  } catch (err) {
    fs.rmSync(pastaTemporaria, { recursive: true, force: true });
    return res.status(500).json({ erro: "Não foi possível copiar o banco de dados." });
  }

  const carimbo = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="oasis_solar_backup_${carimbo}.zip"`);

  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on("error", () => res.destroy());
  res.on("close", () => fs.rmSync(pastaTemporaria, { recursive: true, force: true }));
  zip.pipe(res);

  zip.file(copiaBanco, { name: "banco.db" });
  if (fs.existsSync(UPLOADS_DIR)) zip.directory(UPLOADS_DIR, "uploads");
  zip.append(
    `OASIS SOLAR — backup gerado em ${new Date().toLocaleString("pt-BR")}\n` +
      `Gerado por: ${req.usuario!.nome}\n\n` +
      `banco.db  -> cópia íntegra do banco de dados (SQLite)\n` +
      `uploads/  -> fotos de usinas e imagens de itens de estoque\n\n` +
      `Restauração: parar o sistema, substituir apps/api/prisma/dev.db por banco.db e a pasta apps/api/uploads pelo conteúdo de uploads/.\n`,
    { name: "LEIA-ME.txt" }
  );

  await registrarAuditoria({
    usuarioId: req.usuario!.id,
    modulo: "administracao",
    entidade: "Backup",
    entidadeId: carimbo,
    acao: "ACESSO",
    justificativa: "Backup completo dos dados gerado",
  });

  await zip.finalize();
});

export default router;
