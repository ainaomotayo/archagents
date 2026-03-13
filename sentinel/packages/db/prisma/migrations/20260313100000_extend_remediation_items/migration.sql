-- AlterTable: Make framework_slug and control_code nullable
ALTER TABLE "remediation_items" ALTER COLUMN "framework_slug" DROP NOT NULL;
ALTER TABLE "remediation_items" ALTER COLUMN "control_code" DROP NOT NULL;

-- AlterTable: Convert DateTime columns to TIMESTAMPTZ
ALTER TABLE "remediation_items" ALTER COLUMN "due_date" TYPE TIMESTAMPTZ;
ALTER TABLE "remediation_items" ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ;
ALTER TABLE "remediation_items" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ;
ALTER TABLE "remediation_items" ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ;

-- AlterTable: Add new columns
ALTER TABLE "remediation_items" ADD COLUMN "parent_id" UUID;
ALTER TABLE "remediation_items" ADD COLUMN "finding_id" UUID;
ALTER TABLE "remediation_items" ADD COLUMN "item_type" TEXT NOT NULL DEFAULT 'compliance';
ALTER TABLE "remediation_items" ADD COLUMN "priority_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "remediation_items" ADD COLUMN "external_ref" TEXT;

-- CreateIndex
CREATE INDEX "idx_remediation_queue" ON "remediation_items"("org_id", "status", "priority_score");
CREATE INDEX "idx_remediation_type_status" ON "remediation_items"("org_id", "item_type", "status");
CREATE INDEX "idx_remediation_parent" ON "remediation_items"("parent_id");
CREATE INDEX "idx_remediation_due" ON "remediation_items"("org_id", "due_date");
CREATE INDEX "idx_remediation_finding" ON "remediation_items"("finding_id");

-- DropIndex: Replace old index with new composite
DROP INDEX IF EXISTS "remediation_items_org_id_framework_slug_status_idx";

-- AddForeignKey: Self-referential parent
ALTER TABLE "remediation_items" ADD CONSTRAINT "remediation_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "remediation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Finding relation
ALTER TABLE "remediation_items" ADD CONSTRAINT "remediation_items_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
