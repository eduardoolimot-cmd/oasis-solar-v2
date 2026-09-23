-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" TEXT NOT NULL DEFAULT 'USUARIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "ultimoAcesso" DATETIME,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "usinas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "identificadorInterno" TEXT NOT NULL,
    "municipio" TEXT,
    "uf" TEXT,
    "endereco" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "potenciaDcKwp" REAL NOT NULL,
    "potenciaAcKw" REAL,
    "baseFcPadrao" TEXT NOT NULL DEFAULT 'DC',
    "ucPrincipal" TEXT,
    "dataInstalacao" DATETIME,
    "inicioOperacao" DATETIME,
    "situacao" TEXT NOT NULL DEFAULT 'IMPLANTACAO',
    "observacoes" TEXT,
    "fotoUrl" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "permissoes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "usinaId" TEXT,
    "incluirFuturas" BOOLEAN NOT NULL DEFAULT false,
    "modulo" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "permissoes_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT,
    "usinaId" TEXT,
    "modulo" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT,
    "acao" TEXT NOT NULL,
    "campo" TEXT,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "justificativa" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logs_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usinas_identificadorInterno_key" ON "usinas"("identificadorInterno");

-- CreateIndex
CREATE INDEX "permissoes_usuarioId_idx" ON "permissoes"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_usuarioId_usinaId_modulo_acao_key" ON "permissoes"("usuarioId", "usinaId", "modulo", "acao");

-- CreateIndex
CREATE INDEX "logs_auditoria_usinaId_idx" ON "logs_auditoria"("usinaId");

-- CreateIndex
CREATE INDEX "logs_auditoria_usuarioId_idx" ON "logs_auditoria"("usuarioId");

-- CreateIndex
CREATE INDEX "logs_auditoria_criadoEm_idx" ON "logs_auditoria"("criadoEm");
