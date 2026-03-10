-- AlterTable
ALTER TABLE "policies" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_type" TEXT NOT NULL,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_versions_policy_id_version_idx" ON "policy_versions"("policy_id", "version");

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
