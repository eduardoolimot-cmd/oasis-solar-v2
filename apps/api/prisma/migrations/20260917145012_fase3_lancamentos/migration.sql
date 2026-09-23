-- CreateTable
CREATE TABLE "lancamentos_geracao_diaria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "skidId" TEXT,
    "inversorId" TEXT,
    "data" DATETIME NOT NULL,
    "energiaKwh" REAL NOT NULL,
    "origem" TEXT,
    "observacao" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "lancamentos_geracao_diaria_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lancamentos_geracao_diaria_skidId_fkey" FOREIGN KEY ("skidId") REFERENCES "skids" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "lancamentos_geracao_diaria_inversorId_fkey" FOREIGN KEY ("inversorId") REFERENCES "inversores" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lancamentos_irradiacao_diaria" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "skidId" TEXT,
    "data" DATETIME NOT NULL,
    "irradiacaoKwhM2" REAL NOT NULL,
    "plano" TEXT,
    "origem" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" DATETIME NOT NULL,
    CONSTRAINT "lancamentos_irradiacao_diaria_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lancamentos_irradiacao_diaria_skidId_fkey" FOREIGN KEY ("skidId") REFERENCES "skids" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fechamentos_competencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usinaId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "situacao" TEXT NOT NULL DEFAULT 'PARCIAL',
    "atualizadoPorId" TEXT,
    "atualizadoEm" DATETIME NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fechamentos_competencia_usinaId_fkey" FOREIGN KEY ("usinaId") REFERENCES "usinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "lancamentos_geracao_diaria_usinaId_data_idx" ON "lancamentos_geracao_diaria"("usinaId", "data");

-- CreateIndex
CREATE INDEX "lancamentos_geracao_diaria_skidId_data_idx" ON "lancamentos_geracao_diaria"("skidId", "data");

-- CreateIndex
CREATE INDEX "lancamentos_geracao_diaria_inversorId_data_idx" ON "lancamentos_geracao_diaria"("inversorId", "data");

-- CreateIndex
CREATE INDEX "lancamentos_irradiacao_diaria_usinaId_data_idx" ON "lancamentos_irradiacao_diaria"("usinaId", "data");

-- CreateIndex
CREATE INDEX "lancamentos_irradiacao_diaria_skidId_data_idx" ON "lancamentos_irradiacao_diaria"("skidId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "fechamentos_competencia_usinaId_ano_mes_key" ON "fechamentos_competencia"("usinaId", "ano", "mes");
