-- AlterTable
ALTER TABLE "usinas" ADD COLUMN "origemGeracao" TEXT;
ALTER TABLE "usinas" ADD COLUMN "origemIrradiacao" TEXT;
ALTER TABLE "usinas" ADD COLUMN "planoIrradiacao" TEXT;
ALTER TABLE "usinas" ADD COLUMN "pontoMedicao" TEXT;

-- CreateTable
CREATE TABLE "skids" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "uc" TEXT,
    "potenciaFvKwp" REAL,
    "transformadorKva" REAL,
    "fabricante" TEXT,
    "modelo" TEXT,
    "inicioOperacao" DATETIME,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "skids_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inversores" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "skidId" TEXT,
    "identificacao" TEXT NOT NULL,
    "quantidadeModulos" INTEGER,
    "kwCa" REAL,
    "modelo" TEXT,
    "marca" TEXT,
    "moduloWp" REAL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "inversores_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inversores_skidId_fkey" FOREIGN KEY ("skidId") REFERENCES "skids" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vinculos_inversor_skid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inversorId" TEXT NOT NULL,
    "skidId" TEXT,
    "inicioVigencia" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fimVigencia" DATETIME,
    CONSTRAINT "vinculos_inversor_skid_inversorId_fkey" FOREIGN KEY ("inversorId") REFERENCES "inversores" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vinculos_inversor_skid_skidId_fkey" FOREIGN KEY ("skidId") REFERENCES "skids" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "degradacoes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "perdaPrimeiroAnoPct" REAL NOT NULL,
    "perdaAnualConstantePct" REAL NOT NULL,
    "dataBase" DATETIME NOT NULL,
    "documentoOrigem" TEXT,
    "modeloAdotado" TEXT NOT NULL DEFAULT 'LINEAR',
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "degradacoes_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "previsoes_mensais" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "geracaoPrevistaKwh" REAL,
    "geracaoP50Kwh" REAL,
    "geracaoP90Kwh" REAL,
    "ghiP50KwhM2" REAL,
    "ghiP90KwhM2" REAL,
    "poaP50KwhM2" REAL,
    "poaP90KwhM2" REAL,
    "irradiacaoPrevistaKwhM2" REAL,
    "prPrevistoPct" REAL,
    "prP50Pct" REAL,
    "prP90Pct" REAL,
    "dispGeracaoMetaPct" REAL,
    "dispComunicacaoMetaPct" REAL,
    "documentoOrigem" TEXT,
    "responsavel" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "previsoes_mensais_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "previsoes_anuais" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "geracaoP50Kwh" REAL,
    "geracaoP90Kwh" REAL,
    "ghiP50KwhM2" REAL,
    "ghiP90KwhM2" REAL,
    "poaP50KwhM2" REAL,
    "poaP90KwhM2" REAL,
    "prP50Pct" REAL,
    "prP90Pct" REAL,
    "documentoOrigem" TEXT,
    "responsavel" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "previsoes_anuais_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "importacoes_metas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "ano" INTEGER NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "versaoAnterior" INTEGER,
    "versaoNova" INTEGER NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "importacoes_metas_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "skids_usinaId_nome_key" ON "skids"("usinaId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "inversores_usinaId_identificacao_key" ON "inversores"("usinaId", "identificacao");

-- CreateIndex
CREATE INDEX "vinculos_inversor_skid_inversorId_idx" ON "vinculos_inversor_skid"("inversorId");

-- CreateIndex
CREATE UNIQUE INDEX "degradacoes_usinaId_versao_key" ON "degradacoes"("usinaId", "versao");

-- CreateIndex
CREATE INDEX "previsoes_mensais_usinaId_ano_versao_idx" ON "previsoes_mensais"("usinaId", "ano", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "previsoes_mensais_usinaId_ano_mes_versao_key" ON "previsoes_mensais"("usinaId", "ano", "mes", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "previsoes_anuais_usinaId_ano_versao_key" ON "previsoes_anuais"("usinaId", "ano", "versao");
