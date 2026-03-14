-- CreateTable
CREATE TABLE "ip_attribution_certificates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scan_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "document" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "overall_ai_ratio" DOUBLE PRECISION NOT NULL,
    "total_files" INTEGER NOT NULL,
    "total_loc" INTEGER NOT NULL,
    "conflicting_files" INTEGER NOT NULL,
    "spdx_export" TEXT,
    "cyclonedx_export" TEXT,
    "pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_attribution_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attributions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "certificate_id" UUID NOT NULL,
    "file" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "primary_source" TEXT NOT NULL,
    "tool_name" TEXT,
    "tool_model" TEXT,
    "loc" INTEGER NOT NULL,
    "fusion_method" TEXT NOT NULL,
    "conflicting" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "file_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attribution_evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attribution_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "tool_name" TEXT,
    "tool_model" TEXT,
    "raw_evidence" JSONB NOT NULL,

    CONSTRAINT "attribution_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ip_attribution_certificates_scan_id_key" ON "ip_attribution_certificates"("scan_id");

-- CreateIndex
CREATE INDEX "ip_attribution_certificates_org_id_idx" ON "ip_attribution_certificates"("org_id");

-- CreateIndex
CREATE INDEX "ip_attribution_certificates_project_id_idx" ON "ip_attribution_certificates"("project_id");

-- CreateIndex
CREATE INDEX "file_attributions_certificate_id_idx" ON "file_attributions"("certificate_id");

-- CreateIndex
CREATE INDEX "file_attributions_file_idx" ON "file_attributions"("file");

-- CreateIndex
CREATE INDEX "attribution_evidence_attribution_id_idx" ON "attribution_evidence"("attribution_id");

-- AddForeignKey
ALTER TABLE "ip_attribution_certificates" ADD CONSTRAINT "ip_attribution_certificates_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attributions" ADD CONSTRAINT "file_attributions_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "ip_attribution_certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_evidence" ADD CONSTRAINT "attribution_evidence_attribution_id_fkey" FOREIGN KEY ("attribution_id") REFERENCES "file_attributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
