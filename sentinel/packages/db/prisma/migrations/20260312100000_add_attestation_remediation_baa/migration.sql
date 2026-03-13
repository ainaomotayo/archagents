-- CreateTable
CREATE TABLE "control_attestations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "framework_slug" TEXT NOT NULL,
    "control_code" TEXT NOT NULL,
    "attested_by" TEXT NOT NULL,
    "attestation_type" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "evidence_urls" TEXT[],
    "valid_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revoked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_attestations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attestation_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "previous_state" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "framework_slug" TEXT NOT NULL,
    "control_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "assigned_to" TEXT,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "evidence_notes" TEXT,
    "linked_finding_ids" TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remediation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_associate_agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "vendor_contact" TEXT NOT NULL,
    "agreement_date" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "document_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "covered_services" TEXT[],
    "reviewed_by" TEXT NOT NULL,
    "reviewed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_associate_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_attestations_org_id_framework_slug_control_code_key" ON "control_attestations"("org_id", "framework_slug", "control_code");
CREATE INDEX "control_attestations_org_id_expires_at_idx" ON "control_attestations"("org_id", "expires_at");
CREATE INDEX "attestation_history_attestation_id_idx" ON "attestation_history"("attestation_id");
CREATE INDEX "remediation_items_org_id_framework_slug_status_idx" ON "remediation_items"("org_id", "framework_slug", "status");
CREATE INDEX "remediation_items_org_id_due_date_idx" ON "remediation_items"("org_id", "due_date");
CREATE INDEX "business_associate_agreements_org_id_status_idx" ON "business_associate_agreements"("org_id", "status");

-- AddForeignKey
ALTER TABLE "control_attestations" ADD CONSTRAINT "control_attestations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attestation_history" ADD CONSTRAINT "attestation_history_attestation_id_fkey" FOREIGN KEY ("attestation_id") REFERENCES "control_attestations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "remediation_items" ADD CONSTRAINT "remediation_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_associate_agreements" ADD CONSTRAINT "business_associate_agreements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS
ALTER TABLE "control_attestations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attestation_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "remediation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_associate_agreements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "control_attestations" USING ("org_id"::text = current_setting('app.current_org_id', true));
CREATE POLICY tenant_isolation ON "attestation_history" USING ("attestation_id" IN (SELECT "id" FROM "control_attestations" WHERE "org_id"::text = current_setting('app.current_org_id', true)));
CREATE POLICY tenant_isolation ON "remediation_items" USING ("org_id"::text = current_setting('app.current_org_id', true));
CREATE POLICY tenant_isolation ON "business_associate_agreements" USING ("org_id"::text = current_setting('app.current_org_id', true));
