import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { NistProfileReport, type NistProfileData } from "../NistProfileReport.js";
import type { BrandingContext } from "../branding.js";

export const nistProfileTemplate: ReportTemplate<NistProfileData> = {
  type: "nist_profile",
  displayName: "NIST AI RMF Profile Report",
  description: "NIST AI Risk Management Framework profile with function-level scoring",
  gather: async (_ctx: GatherContext): Promise<NistProfileData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: NistProfileData, branding: BrandingContext) => {
    return createElement(NistProfileReport, { data, branding }) as any;
  },
};
