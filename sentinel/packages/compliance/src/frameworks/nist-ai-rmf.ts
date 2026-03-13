import type { FrameworkDefinition } from "../types.js";

export const NIST_AI_RMF: FrameworkDefinition = {
  slug: "nist-ai-rmf",
  name: "NIST AI RMF 1.0",
  version: "1.0",
  category: "regulatory",
  controls: [
    // ===== GOVERN (GV) =====
    { code: "GV-1", name: "Policies for AI Risk Management", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-1.1", name: "Legal and Regulatory Requirements Identified", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1", description: "Legal and regulatory requirements involving AI are understood, managed, and documented." },
    { code: "GV-1.2", name: "Trustworthy AI Characteristics Integrated", weight: 2.5, matchRules: [{ agent: "quality", category: "quality/documentation*" }], requirementType: "hybrid", parentCode: "GV-1" },
    { code: "GV-1.3", name: "Risk Management Processes Established", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.4", name: "Ongoing Monitoring of AI Risks", weight: 2.0, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "GV-1" },
    { code: "GV-1.5", name: "Risk Management Processes Documented", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.6", name: "Risk Management Integrated into Business Processes", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.7", name: "Mechanisms to Inventory AI Systems", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },

    { code: "GV-2", name: "Accountability Structures", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-2.1", name: "Roles and Responsibilities Defined", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },
    { code: "GV-2.2", name: "Designated AI Risk Oversight Function", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },
    { code: "GV-2.3", name: "Executive Leadership Engagement", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },

    { code: "GV-3", name: "Workforce Diversity and Culture", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-3.1", name: "Decision-Making Oversight Defined", weight: 2.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/oversight-gap*" }], requirementType: "hybrid", parentCode: "GV-3" },
    { code: "GV-3.2", name: "Policies for AI Training and Awareness", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-3" },

    { code: "GV-4", name: "Organizational Practices Monitored", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-4.1", name: "Organizational Monitoring for AI Risk", weight: 2.0, matchRules: [{ agent: "quality" }], requirementType: "hybrid", parentCode: "GV-4" },
    { code: "GV-4.2", name: "AI Risk Feedback Mechanisms", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-4" },
    { code: "GV-4.3", name: "Review and Update of Processes", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-4" },

    { code: "GV-5", name: "Engagement with External Stakeholders", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-5.1", name: "Data Governance Policies Established", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/data-governance*" }], requirementType: "hybrid", parentCode: "GV-5" },
    { code: "GV-5.2", name: "Stakeholder Feedback Incorporated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-5" },

    { code: "GV-6", name: "Third-Party Risk Management", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-6.1", name: "Policies Address Third-Party AI Risks", weight: 2.5, matchRules: [{ agent: "dependency", category: "dependency/ai-supply-chain*" }], requirementType: "hybrid", parentCode: "GV-6" },
    { code: "GV-6.2", name: "Contingency for Third-Party Failures", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-6" },

    // ===== MAP (MP) =====
    { code: "MP-1", name: "Context and Use Cases", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-1.1", name: "Intended Purpose Defined", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.2", name: "Interdisciplinary AI Actors Identified", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.3", name: "Target Audience Defined", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.4", name: "Usage Context Documented", weight: 1.5, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-1" },
    { code: "MP-1.5", name: "Assumptions and Limitations Documented", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-1" },
    { code: "MP-1.6", name: "Scientific Integrity and Reproducibility", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },

    { code: "MP-2", name: "AI Categorization", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-2.1", name: "AI System Categorized by Risk Level", weight: 2.0, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "automated", parentCode: "MP-2" },
    { code: "MP-2.2", name: "Potential Harms Mapped", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-2" },
    { code: "MP-2.3", name: "Scientific Integrity Maintained", weight: 2.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/provenance*" }], requirementType: "hybrid", parentCode: "MP-2" },

    { code: "MP-3", name: "Benefits and Costs", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-3.1", name: "Benefits Assessed Against Costs", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.2", name: "Benefits and Costs for Affected Communities", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.3", name: "Benefits vs Potential Impacts Balanced", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.4", name: "Impacts to Individuals Assessed", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },

    { code: "MP-4", name: "Risks and Impacts", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-4.1", name: "Benefits and Costs Documented", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-4" },

    { code: "MP-5", name: "Impact Assessment", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-5.1", name: "Likelihood of Mapped Impacts Assessed", weight: 2.5, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MP-5" },
    { code: "MP-5.2", name: "Impact Likelihood Regularly Updated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-5" },

    // ===== MEASURE (MS) =====
    { code: "MS-1", name: "Measurement Approaches", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-1.1", name: "Measurement Approaches Applied", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-test-coverage*" }], requirementType: "hybrid", parentCode: "MS-1" },
    { code: "MS-1.2", name: "Participatory Methods in Measurement", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-1" },
    { code: "MS-1.3", name: "Internal and External Experts Consulted", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-1" },

    { code: "MS-2", name: "AI System Evaluation", weight: 3.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-2.1", name: "Valid and Reliable Output Evaluated", weight: 2.5, matchRules: [{ agent: "ai-detector" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.2", name: "AI Evaluated for Safety", weight: 3.0, matchRules: [{ category: "vulnerability/*" }, { agent: "ai-detector" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.3", name: "AI Evaluated for Fairness and Bias", weight: 3.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/bias-indicator*" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.4", name: "AI Evaluated for Explainability", weight: 2.0, matchRules: [{ agent: "ai-detector" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.5", name: "AI Evaluated for Security", weight: 3.0, matchRules: [{ agent: "security" }, { category: "vulnerability/ai-input-validation*" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.6", name: "AI Evaluated for Resilience", weight: 2.5, matchRules: [{ agent: "security" }, { agent: "dependency" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.7", name: "AI Evaluated for Privacy", weight: 2.5, matchRules: [{ category: "vulnerability/phi-exposure*" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.8", name: "AI Transparency Assessed", weight: 2.5, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }, { category: "vulnerability/ai-transparency*" }], requirementType: "hybrid", parentCode: "MS-2" },

    { code: "MS-3", name: "Tracking Metrics", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-3.1", name: "Metrics Tracked Over Time", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },
    { code: "MS-3.2", name: "External Validation Methods", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },
    { code: "MS-3.3", name: "Feedback Loops Incorporated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },

    { code: "MS-4", name: "Measurement Updates", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-4.1", name: "Measurement Approaches Updated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-4" },
    { code: "MS-4.2", name: "Methods Include Participatory Processes", weight: 1.0, matchRules: [], requirementType: "attestation", parentCode: "MS-4" },

    // ===== MANAGE (MG) =====
    { code: "MG-1", name: "Risk Treatment Plans", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-1.1", name: "Risk Treatment Plans in Place", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },
    { code: "MG-1.2", name: "Resources Allocated for Risk Treatment", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },
    { code: "MG-1.3", name: "Responses Prioritized by Impact", weight: 2.0, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MG-1" },
    { code: "MG-1.4", name: "Risk Treatment Mapped to Tolerance", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },

    { code: "MG-2", name: "Risk Response", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-2.1", name: "Responses to Identified Risks Applied", weight: 2.5, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "hybrid", parentCode: "MG-2" },
    { code: "MG-2.2", name: "Incidents Documented", weight: 2.5, matchRules: [], requirementType: "automated", parentCode: "MG-2", description: "Covered by audit trail and evidence chain" },
    { code: "MG-2.3", name: "AI Risks Re-evaluated Regularly", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-2" },
    { code: "MG-2.4", name: "Escalation Processes in Place", weight: 2.0, matchRules: [], requirementType: "automated", parentCode: "MG-2", description: "Covered by approval workflow escalation" },

    { code: "MG-3", name: "Pre-Deployment Evaluation", weight: 3.0, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-3.1", name: "Pre-Deployment Risk Evaluated", weight: 3.0, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "automated", parentCode: "MG-3", description: "Covered by scan + approval gate pipeline" },
    { code: "MG-3.2", name: "Deployment Criteria Established", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-3" },

    { code: "MG-4", name: "Post-Deployment Monitoring", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-4.1", name: "Post-Deployment Monitoring in Place", weight: 2.5, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MG-4", description: "Scheduled scans + attestation of monitoring process" },
    { code: "MG-4.2", name: "Monitoring Results Applied", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-4" },
    { code: "MG-4.3", name: "Decommissioning Procedures", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MG-4" },
  ],
};
