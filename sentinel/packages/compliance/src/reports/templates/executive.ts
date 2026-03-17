import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { ExecutiveReport, type ExecutiveReportData } from "../ExecutiveReport.js";
import type { BrandingContext } from "../branding.js";

export const executiveTemplate: ReportTemplate<ExecutiveReportData> = {
  type: "executive",
  displayName: "Executive Compliance Report",
  description: "High-level multi-framework compliance overview for executive stakeholders",
  gather: async (_ctx: GatherContext): Promise<ExecutiveReportData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: ExecutiveReportData, branding: BrandingContext) => {
    return createElement(ExecutiveReport, { data, branding }) as any;
  },
};
