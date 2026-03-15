-- Add format and tree_rules columns to policies
ALTER TABLE "policies" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'yaml';
ALTER TABLE "policies" ADD COLUMN "tree_rules" JSONB;
CREATE INDEX "idx_policies_format" ON "policies"("org_id", "format");

-- Add format and tree_rules columns to policy_versions
ALTER TABLE "policy_versions" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'yaml';
ALTER TABLE "policy_versions" ADD COLUMN "tree_rules" JSONB;
