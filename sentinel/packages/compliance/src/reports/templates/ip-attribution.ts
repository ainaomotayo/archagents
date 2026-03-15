import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { IPAttributionReport } from "../IPAttributionReport.js";
import type { IPAttributionReportData } from "../../ip-attribution/types.js";
import type { BrandingContext } from "../branding.js";

export const ipAttributionTemplate: ReportTemplate<IPAttributionReportData> = {
  type: "ip_attribution",
  displayName: "IP Attribution Certificate",
  description: "Intellectual property attribution certificate with AI-generated code analysis",
  gather: async (_ctx: GatherContext): Promise<IPAttributionReportData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: IPAttributionReportData, branding: BrandingContext) => {
    return createElement(IPAttributionReport, { data, branding }) as any;
  },
};
