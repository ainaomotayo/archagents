import { ReportRegistry } from "../registry.js";
import { complianceSummaryTemplate } from "./compliance-summary.js";
import { auditEvidenceTemplate } from "./audit-evidence.js";
import { executiveTemplate } from "./executive.js";
import { nistProfileTemplate } from "./nist-profile.js";
import { hipaaAssessmentTemplate } from "./hipaa-assessment.js";
import { ipAttributionTemplate } from "./ip-attribution.js";
import { euAiActTechnicalDocTemplate } from "./eu-ai-act-technical-doc.js";
import { euAiActDeclarationTemplate } from "./eu-ai-act-declaration.js";
import { euAiActInstructionsTemplate } from "./eu-ai-act-instructions.js";
import { euAiActMonitoringTemplate } from "./eu-ai-act-monitoring.js";

export function createDefaultRegistry(): ReportRegistry {
  const registry = new ReportRegistry();
  registry.register(complianceSummaryTemplate);
  registry.register(auditEvidenceTemplate);
  registry.register(executiveTemplate);
  registry.register(nistProfileTemplate);
  registry.register(hipaaAssessmentTemplate);
  registry.register(ipAttributionTemplate);
  registry.register(euAiActTechnicalDocTemplate);
  registry.register(euAiActDeclarationTemplate);
  registry.register(euAiActInstructionsTemplate);
  registry.register(euAiActMonitoringTemplate);
  return registry;
}
