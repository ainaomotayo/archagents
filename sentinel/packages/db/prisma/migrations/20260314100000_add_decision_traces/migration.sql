-- CreateTable
CREATE TABLE "decision_traces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "finding_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "tool_name" TEXT,
    "model_version" TEXT,
    "prompt_hash" TEXT,
    "prompt_category" TEXT,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "declared_tool" TEXT,
    "declared_model" TEXT,
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "decision_traces_finding_id_key" ON "decision_traces"("finding_id");

-- CreateIndex
CREATE INDEX "decision_traces_org_id_tool_name_idx" ON "decision_traces"("org_id", "tool_name");

-- CreateIndex
CREATE INDEX "decision_traces_scan_id_idx" ON "decision_traces"("scan_id");

-- AddForeignKey
ALTER TABLE "decision_traces" ADD CONSTRAINT "decision_traces_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
