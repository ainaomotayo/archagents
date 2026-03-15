import { ReportRegistry } from "../registry.js";
import { complianceSummaryTemplate } from "./compliance-summary.js";
import { auditEvidenceTemplate } from "./audit-evidence.js";
import { executiveTemplate } from "./executive.js";
import { nistProfileTemplate } from "./nist-profile.js";
import { hipaaAssessmentTemplate } from "./hipaa-assessment.js";
import { ipAttributionTemplate } from "./ip-attribution.js";

export function createDefaultRegistry(): ReportRegistry {
  const registry = new ReportRegistry();
  registry.register(complianceSummaryTemplate);
  registry.register(auditEvidenceTemplate);
  registry.register(executiveTemplate);
  registry.register(nistProfileTemplate);
  registry.register(hipaaAssessmentTemplate);
  registry.register(ipAttributionTemplate);
  return registry;
}
