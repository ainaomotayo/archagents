import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { ComplianceSummaryReport, type ComplianceSummaryData } from "../ComplianceSummaryReport.js";
import type { BrandingContext } from "../branding.js";

export const complianceSummaryTemplate: ReportTemplate<ComplianceSummaryData> = {
  type: "compliance_summary",
  displayName: "Compliance Summary Report",
  description: "Framework compliance overview with score donut and control breakdown",
  gather: async (_ctx: GatherContext): Promise<ComplianceSummaryData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: ComplianceSummaryData, branding: BrandingContext) => {
    return createElement(ComplianceSummaryReport, { data, branding }) as any;
  },
};
