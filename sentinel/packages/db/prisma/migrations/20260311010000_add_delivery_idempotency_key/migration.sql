-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_idempotency_key_key" ON "webhook_deliveries"("idempotency_key");
