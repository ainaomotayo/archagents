import type { FrameworkDefinition } from "../types.js";

export const EU_AI_ACT: FrameworkDefinition = {
  slug: "eu-ai-act",
  name: "EU AI Act",
  version: "2024",
  category: "regulatory",
  controls: [
    { code: "AIA-10", name: "Data and Data Governance", weight: 3.0, matchRules: [{ agent: "ai-detector" }] },
    { code: "AIA-11", name: "Technical Documentation", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/documentation*" }] },
    { code: "AIA-13", name: "Transparency to Users", weight: 3.0, matchRules: [{ agent: "ai-detector", severity: ["critical", "high"] }] },
    { code: "AIA-14", name: "Human Oversight", weight: 2.0, matchRules: [{ agent: "ai-detector", severity: ["critical"] }] },
    { code: "AIA-15", name: "Accuracy, Robustness, Cybersecurity", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical", "high"] }] },
    { code: "AIA-17", name: "Quality Management System", weight: 1.0, matchRules: [{ agent: "quality" }] },
    { code: "AIA-52", name: "Transparency for General-Purpose AI", weight: 2.0, matchRules: [{ agent: "ai-detector" }] },
    { code: "AIA-9", name: "Risk Management System", weight: 2.0, matchRules: [{ severity: ["critical", "high", "medium"] }] },
  ],
};
