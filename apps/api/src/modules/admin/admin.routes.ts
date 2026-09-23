import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { registrarAuditoria } from "../../lib/auditoria";
import {
  BACKUPS_DIR,
  caminhoBancoSqlite,
  carimboAgora,
  copiarBancoAtual,
  ErroRestauracao,
  listarBackupsDeSeguranca,
  montarZipBackup,
  restaurarBackup,
  TAMANHO_MAXIMO_RESTAURACAO_BYTES,
} from "../../lib/backup";
import { prisma } from "../../lib/prisma";
import { UPLOADS_DIR } from "../../lib/upload";
import { autenticar, exigirAdmin } from "../../middleware/auth";

// Área exclusiva do administrador: backup completo dos dados e restauração a partir de um backup.
//
// Backup = um .zip com (1) uma cópia consistente do banco de dados e (2) a pasta de arquivos
// enviados. No banco SQLite a cópia é feita com "VACUUM INTO" (cópia íntegra mesmo com o sistema em
// uso). Com PostgreSQL o backup do banco é feito com pg_dump no servidor — ver docs/DECISOES_PLACEHOLDER.md.
// Formato, validações e backup de segurança da restauração: lib/backup.ts.

const router = Router();
router.use(autenticar, exigirAdmin);

const uploadBackup = multer({ dest: os.tmpdir(), limits: { fileSize: TAMANHO_MAXIMO_RESTAURACAO_BYTES } });

router.get("/backup/info", async (_req, res) => {
  const banco = caminhoBancoSqlite();
  const tamanhoBanco = banco && fs.existsSync(banco) ? fs.statSync(banco).size : null;
  const arquivos = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR).length : 0;
  const [ultimo, ultimaRestauracao] = await Promise.all(
    ["Backup", "Restauracao"].map((entidade) =>
      prisma.logAuditoria.findFirst({
        where: { modulo: "administracao", entidade },
        orderBy: { criadoEm: "desc" },
        include: { usuario: { select: { nome: true } } },
      })
    )
  );
  res.json({
    tipoBanco: banco ? "SQLite" : "PostgreSQL",
    backupDoBancoPelaInterface: banco !== null,
    tamanhoBancoBytes: tamanhoBanco,
    arquivosEnviados: arquivos,
    ultimoBackup: ultimo ? { data: ultimo.criadoEm, usuario: ultimo.usuario?.nome ?? null } : null,
    ultimaRestauracao: ultimaRestauracao ? { data: ultimaRestauracao.criadoEm, usuario: ultimaRestauracao.usuario?.nome ?? null } : null,
    backupsDeSeguranca: listarBackupsDeSeguranca(),
    tamanhoMaximoRestauracaoBytes: TAMANHO_MAXIMO_RESTAURACAO_BYTES,
  });
});

router.get("/backup", async (req, res) => {
  if (!caminhoBancoSqlite()) {
    return res.status(501).json({
      erro: "Este ambiente usa PostgreSQL — o backup do banco deve ser feito com pg_dump no servidor. A interface só gera backup do banco SQLite.",
    });
  }

  let copia: { pasta: string; arquivo: string };
  try {
    copia = await copiarBancoAtual();
  } catch {
    return res.status(500).json({ erro: "Não foi possível copiar o banco de dados." });
  }

  const carimbo = carimboAgora();
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="oasis_solar_backup_${carimbo}.zip"`);

  const zip = montarZipBackup(copia.arquivo, req.usuario!.nome);
  zip.on("error", () => res.destroy());
  res.on("close", () => fs.rmSync(copia.pasta, { recursive: true, force: true }));
  zip.pipe(res);

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

/// Baixa um backup de segurança gerado automaticamente antes de uma restauração.
router.get("/backup/seguranca/:nome", (req, res) => {
  const nome = req.params.nome;
  if (!/^[\w.-]+\.zip$/.test(nome) || !fs.existsSync(path.join(BACKUPS_DIR, nome))) {
    return res.status(404).json({ erro: "Backup não encontrado." });
  }
  res.download(path.join(BACKUPS_DIR, nome), nome);
});

router.post(
  "/restauracao",
  (req, res, next) =>
    uploadBackup.single("arquivo")(req, res, (err: unknown) => {
      if (!err) return next();
      const limite = (err as { code?: string }).code === "LIMIT_FILE_SIZE";
      res.status(400).json({ erro: limite ? "Arquivo maior que o limite de 500 MB." : "Falha no envio do arquivo." });
    }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ erro: "Selecione o arquivo de backup." });
    try {
      if (req.body?.confirmacao !== "RESTAURAR") {
        return res.status(400).json({ erro: 'Confirme digitando RESTAURAR.' });
      }
      const resultado = await restaurarBackup(req.file.path, req.usuario!.nome);

      // O registro vai para o banco restaurado; o administrador só é vinculado se existir nele.
      const existeNoRestaurado = await prisma.usuario.findUnique({ where: { id: req.usuario!.id }, select: { id: true } });
      await registrarAuditoria({
        usuarioId: existeNoRestaurado ? req.usuario!.id : null,
        modulo: "administracao",
        entidade: "Restauracao",
        entidadeId: carimboAgora(),
        acao: "EDICAO",
        justificativa: `Banco restaurado a partir de "${req.file.originalname}" por ${req.usuario!.nome} (${req.usuario!.email}). Estado anterior salvo em backups/${resultado.backupDeSeguranca}.`,
      });

      res.json(resultado);
    } catch (err) {
      if (err instanceof ErroRestauracao) return res.status(400).json({ erro: err.message });
      console.error("Falha na restauração do backup:", err);
      res.status(500).json({
        erro: "Falha inesperada na restauração. Se o banco já tinha sido trocado, o estado anterior está em Backups de segurança, nesta mesma tela.",
      });
    } finally {
      fs.rmSync(req.file.path, { force: true });
    }
  }
);

export default router;
