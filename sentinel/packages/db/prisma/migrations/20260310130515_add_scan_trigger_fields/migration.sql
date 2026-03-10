-- AlterTable
ALTER TABLE "scans" ADD COLUMN "trigger_type" TEXT,
ADD COLUMN "trigger_meta" JSONB NOT NULL DEFAULT '{}';
