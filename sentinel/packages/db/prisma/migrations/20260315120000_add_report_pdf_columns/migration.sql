-- AlterTable
ALTER TABLE "reports" ADD COLUMN "file_size" INTEGER;
ALTER TABLE "reports" ADD COLUMN "page_count" INTEGER;
ALTER TABLE "reports" ADD COLUMN "storage_key" TEXT;
ALTER TABLE "reports" ADD COLUMN "batch_id" TEXT;
ALTER TABLE "reports" ADD COLUMN "error" TEXT;
ALTER TABLE "reports" ADD COLUMN "expires_at" TIMESTAMPTZ;
ALTER TABLE "reports" ADD COLUMN "delivery" TEXT DEFAULT 'download';

-- CreateIndex
CREATE INDEX "reports_batch_id_idx" ON "reports"("batch_id");
