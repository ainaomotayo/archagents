import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { EuAiActTechnicalDocReport, type TechnicalDocData } from "../EuAiActTechnicalDoc.js";
import type { BrandingContext } from "../branding.js";

export const euAiActTechnicalDocTemplate: ReportTemplate<TechnicalDocData> = {
  type: "eu_ai_act_technical_documentation",
  displayName: "EU AI Act - Technical Documentation",
  description: "Technical documentation required under Article 11 of the EU AI Act for high-risk AI systems",
  gather: async (_ctx: GatherContext): Promise<TechnicalDocData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: TechnicalDocData, branding: BrandingContext) => {
    return createElement(EuAiActTechnicalDocReport, { data, branding }) as any;
  },
};
