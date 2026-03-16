-- CreateTable
CREATE TABLE "compliance_wizards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "framework_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "compliance_wizards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wizard_id" UUID NOT NULL,
    "control_code" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'locked',
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "justification" TEXT,
    "skip_reason" TEXT,
    "completed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wizard_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_step_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "step_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wizard_step_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wizard_id" UUID NOT NULL,
    "control_code" TEXT,
    "event_type" TEXT NOT NULL,
    "previous_state" TEXT,
    "new_state" TEXT,
    "actor_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wizard_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wizard_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wizard_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "report_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "generated_at" TIMESTAMPTZ,

    CONSTRAINT "wizard_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "compliance_wizards_org_id_framework_code_name_key" ON "compliance_wizards"("org_id", "framework_code", "name");
CREATE UNIQUE INDEX "wizard_steps_wizard_id_control_code_key" ON "wizard_steps"("wizard_id", "control_code");
CREATE UNIQUE INDEX "wizard_documents_wizard_id_document_type_key" ON "wizard_documents"("wizard_id", "document_type");

-- CreateIndex (performance indexes)
CREATE INDEX "compliance_wizards_org_id_idx" ON "compliance_wizards"("org_id");
CREATE INDEX "wizard_steps_wizard_id_idx" ON "wizard_steps"("wizard_id");
CREATE INDEX "wizard_events_wizard_id_timestamp_idx" ON "wizard_events"("wizard_id", "timestamp");

-- AddForeignKey
ALTER TABLE "compliance_wizards" ADD CONSTRAINT "compliance_wizards_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "compliance_wizards" ADD CONSTRAINT "compliance_wizards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wizard_steps" ADD CONSTRAINT "wizard_steps_wizard_id_fkey" FOREIGN KEY ("wizard_id") REFERENCES "compliance_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wizard_step_evidence" ADD CONSTRAINT "wizard_step_evidence_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "wizard_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wizard_step_evidence" ADD CONSTRAINT "wizard_step_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wizard_events" ADD CONSTRAINT "wizard_events_wizard_id_fkey" FOREIGN KEY ("wizard_id") REFERENCES "compliance_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wizard_events" ADD CONSTRAINT "wizard_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wizard_documents" ADD CONSTRAINT "wizard_documents_wizard_id_fkey" FOREIGN KEY ("wizard_id") REFERENCES "compliance_wizards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
