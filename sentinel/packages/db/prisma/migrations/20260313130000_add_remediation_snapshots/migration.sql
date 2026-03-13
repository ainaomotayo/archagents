-- CreateTable
CREATE TABLE "remediation_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'org',
    "scope_value" TEXT,
    "open_count" INTEGER NOT NULL,
    "in_progress_count" INTEGER NOT NULL,
    "completed_count" INTEGER NOT NULL,
    "accepted_risk_count" INTEGER NOT NULL,
    "avg_resolution_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "remediation_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remediation_snapshots_org_scope_date_key" ON "remediation_snapshots"("org_id", "snapshot_date", "scope", "scope_value");

-- CreateIndex
CREATE INDEX "remediation_snapshots_org_scope_idx" ON "remediation_snapshots"("org_id", "scope", "snapshot_date");

-- AddForeignKey
ALTER TABLE "remediation_snapshots" ADD CONSTRAINT "remediation_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
