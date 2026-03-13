-- CreateTable
CREATE TABLE "approval_gates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scan_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gate_type" TEXT NOT NULL,
    "trigger_criteria" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigned_role" TEXT,
    "assigned_to" UUID,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "escalates_at" TIMESTAMPTZ,
    "expiry_action" TEXT NOT NULL DEFAULT 'reject',
    "decided_at" TIMESTAMPTZ,

    CONSTRAINT "approval_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gate_id" UUID NOT NULL,
    "decided_by" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_gates_org_id_status_idx" ON "approval_gates"("org_id", "status");
CREATE INDEX "approval_gates_scan_id_idx" ON "approval_gates"("scan_id");
CREATE INDEX "approval_gates_expires_at_idx" ON "approval_gates"("expires_at");
CREATE INDEX "approval_decisions_gate_id_idx" ON "approval_decisions"("gate_id");

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "approval_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
