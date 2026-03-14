-- CreateTable
CREATE TABLE "ai_metrics_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "project_id" UUID,
    "snapshot_date" DATE NOT NULL,
    "granularity" TEXT NOT NULL DEFAULT 'daily',
    "total_files" INTEGER NOT NULL,
    "ai_files" INTEGER NOT NULL,
    "total_loc" INTEGER NOT NULL,
    "ai_loc" INTEGER NOT NULL,
    "ai_ratio" DOUBLE PRECISION NOT NULL,
    "ai_influence_score" DOUBLE PRECISION NOT NULL,
    "avg_probability" DOUBLE PRECISION NOT NULL,
    "median_probability" DOUBLE PRECISION NOT NULL,
    "p95_probability" DOUBLE PRECISION NOT NULL,
    "tool_breakdown" JSONB NOT NULL DEFAULT '[]',
    "compliance_gaps" JSONB NOT NULL DEFAULT '{}',
    "scan_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_metrics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_metrics_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "strict_mode" BOOLEAN NOT NULL DEFAULT false,
    "alert_enabled" BOOLEAN NOT NULL DEFAULT false,
    "alert_max_ratio" DOUBLE PRECISION,
    "alert_spike_std_dev" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "alert_new_tool" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_metrics_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_metrics_snapshots_org_id_project_id_snapshot_date_granula_key" ON "ai_metrics_snapshots"("org_id", "project_id", "snapshot_date", "granularity");

-- CreateIndex
CREATE INDEX "ai_metrics_snapshots_org_id_granularity_snapshot_date_idx" ON "ai_metrics_snapshots"("org_id", "granularity", "snapshot_date" DESC);

-- CreateIndex
CREATE INDEX "ai_metrics_snapshots_project_id_granularity_snapshot_date_idx" ON "ai_metrics_snapshots"("project_id", "granularity", "snapshot_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ai_metrics_configs_org_id_key" ON "ai_metrics_configs"("org_id");

-- AddForeignKey
ALTER TABLE "ai_metrics_snapshots" ADD CONSTRAINT "ai_metrics_snapshots_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_metrics_snapshots" ADD CONSTRAINT "ai_metrics_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_metrics_configs" ADD CONSTRAINT "ai_metrics_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
