import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { EuAiActInstructionsReport, type InstructionsData } from "../EuAiActInstructions.js";
import type { BrandingContext } from "../branding.js";

export const euAiActInstructionsTemplate: ReportTemplate<InstructionsData> = {
  type: "eu_ai_act_instructions_for_use",
  displayName: "EU AI Act - Instructions for Use",
  description: "Instructions for use required under Article 13 of the EU AI Act for deployers of high-risk AI systems",
  gather: async (_ctx: GatherContext): Promise<InstructionsData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: InstructionsData, branding: BrandingContext) => {
    return createElement(EuAiActInstructionsReport, { data, branding }) as any;
  },
};
