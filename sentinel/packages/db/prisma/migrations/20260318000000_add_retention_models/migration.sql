-- CreateTable: retention_policies
CREATE TABLE "retention_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "preset" TEXT NOT NULL,
    "tier_critical" INTEGER NOT NULL,
    "tier_high" INTEGER NOT NULL,
    "tier_medium" INTEGER NOT NULL,
    "tier_low" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: retention_policy_changes
CREATE TABLE "retention_policy_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "preset" TEXT NOT NULL,
    "tier_critical" INTEGER NOT NULL,
    "tier_high" INTEGER NOT NULL,
    "tier_medium" INTEGER NOT NULL,
    "tier_low" INTEGER NOT NULL,
    "dry_run_estimate" JSONB,
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ,

    CONSTRAINT "retention_policy_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: archive_destinations
CREATE TABLE "archive_destinations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "credential_ref" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "archive_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: retention_executions
CREATE TABLE "retention_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "policy_snapshot" JSONB NOT NULL,
    "archived_count" JSONB,
    "deleted_count" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "retention_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: retention_stats
CREATE TABLE "retention_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "severity" TEXT NOT NULL,
    "age_bucket" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "snapshot_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable: encrypted_credentials
CREATE TABLE "encrypted_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "tag" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "encrypted_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_org_id_key" ON "retention_policies"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_stats_org_id_severity_age_bucket_snapshot_at_key"
    ON "retention_stats"("org_id", "severity", "age_bucket", "snapshot_at");

-- CreateIndex
CREATE INDEX "retention_policy_changes_org_id_status_idx" ON "retention_policy_changes"("org_id", "status");

-- CreateIndex
CREATE INDEX "retention_executions_org_id_started_at_idx" ON "retention_executions"("org_id", "started_at");

-- CreateIndex
CREATE INDEX "retention_stats_org_id_snapshot_at_idx" ON "retention_stats"("org_id", "snapshot_at");

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policy_changes" ADD CONSTRAINT "retention_policy_changes_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_destinations" ADD CONSTRAINT "archive_destinations_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_executions" ADD CONSTRAINT "retention_executions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_stats" ADD CONSTRAINT "retention_stats_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encrypted_credentials" ADD CONSTRAINT "encrypted_credentials_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
