import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { AuditEvidenceReport, type AuditEvidenceData } from "../AuditEvidenceReport.js";
import type { BrandingContext } from "../branding.js";

export const auditEvidenceTemplate: ReportTemplate<AuditEvidenceData> = {
  type: "audit_evidence",
  displayName: "Audit Evidence Report",
  description: "Detailed evidence chain with hash verification for compliance audits",
  gather: async (_ctx: GatherContext): Promise<AuditEvidenceData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: AuditEvidenceData, branding: BrandingContext) => {
    return createElement(AuditEvidenceReport, { data, branding }) as any;
  },
};
