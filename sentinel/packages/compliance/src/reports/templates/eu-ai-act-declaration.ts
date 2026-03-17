import { createElement } from "react";
import type { ReportTemplate, GatherContext } from "../registry.js";
import { EuAiActDeclarationReport, type DeclarationData } from "../EuAiActDeclaration.js";
import type { BrandingContext } from "../branding.js";

export const euAiActDeclarationTemplate: ReportTemplate<DeclarationData> = {
  type: "eu_ai_act_declaration_of_conformity",
  displayName: "EU AI Act - Declaration of Conformity",
  description: "Declaration of conformity required under Article 47 of the EU AI Act",
  gather: async (_ctx: GatherContext): Promise<DeclarationData> => {
    throw new Error("gather() must be called with assembled data");
  },
  render: (data: DeclarationData, branding: BrandingContext) => {
    return createElement(EuAiActDeclarationReport, { data, branding }) as any;
  },
};
