-- DropIndex
DROP INDEX "inversores_usinaId_identificacao_key";

-- CreateIndex
CREATE UNIQUE INDEX "inversores_usinaId_skidId_identificacao_key" ON "inversores"("usinaId", "skidId", "identificacao");

