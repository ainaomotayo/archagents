-- CreateTable
CREATE TABLE "approval_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "strategy_type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "assignee_role" TEXT NOT NULL DEFAULT 'manager',
    "sla_hours" INTEGER NOT NULL DEFAULT 24,
    "escalate_after_hours" INTEGER NOT NULL DEFAULT 48,
    "expiry_action" TEXT NOT NULL DEFAULT 'reject',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "approval_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_gates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "policy_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gate_type" TEXT NOT NULL,
    "trigger_criteria" JSONB NOT NULL DEFAULT '{}',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "assigned_role" TEXT,
    "assigned_to" TEXT,
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
    "org_id" UUID NOT NULL,
    "decided_by" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "decided_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add approval_status to scans
ALTER TABLE "scans" ADD COLUMN "approval_status" TEXT;

-- AlterTable: Add approved_by and approved_at to certificates
ALTER TABLE "certificates" ADD COLUMN "approved_by" TEXT;
ALTER TABLE "certificates" ADD COLUMN "approved_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "approval_policies_org_id_enabled_idx" ON "approval_policies"("org_id", "enabled");

-- CreateIndex
CREATE INDEX "approval_gates_org_id_status_idx" ON "approval_gates"("org_id", "status");

-- CreateIndex
CREATE INDEX "approval_gates_scan_id_idx" ON "approval_gates"("scan_id");

-- CreateIndex
CREATE INDEX "approval_gates_expires_at_idx" ON "approval_gates"("expires_at");

-- CreateIndex
CREATE INDEX "idx_approval_queue" ON "approval_gates"("org_id", "status", "priority");

-- CreateIndex
CREATE INDEX "approval_decisions_gate_id_idx" ON "approval_decisions"("gate_id");

-- CreateIndex
CREATE INDEX "approval_decisions_org_id_decided_at_idx" ON "approval_decisions"("org_id", "decided_at");

-- AddForeignKey
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_gates" ADD CONSTRAINT "approval_gates_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "approval_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_gate_id_fkey" FOREIGN KEY ("gate_id") REFERENCES "approval_gates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
