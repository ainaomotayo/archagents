import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { HipaaAssessmentReport, type HipaaAssessmentData } from "../HipaaAssessmentReport.js";
import type { BrandingContext } from "../branding.js";

export const hipaaAssessmentTemplate: ReportTemplate<HipaaAssessmentData> = {
  type: "hipaa_assessment",
  displayName: "HIPAA Security Rule Assessment",
  description: "HIPAA security rule safeguard assessment with administrative, physical, and technical controls",
  gather: async (_ctx: GatherContext): Promise<HipaaAssessmentData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: HipaaAssessmentData, _branding: BrandingContext) => {
    return createElement(HipaaAssessmentReport, { data }) as any;
  },
};
