import type { FrameworkDefinition } from "../types.js";

export const SOC2: FrameworkDefinition = {
  slug: "soc2",
  name: "SOC 2 Type II",
  version: "2024",
  category: "governance",
  controls: [
    { code: "CC6.1", name: "Logical and Physical Access Controls", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical", "high"] }] },
    { code: "CC6.6", name: "Security Against Threats", weight: 3.0, matchRules: [{ agent: "security", severity: ["critical", "high"] }] },
    { code: "CC6.7", name: "Transmission Integrity", weight: 2.0, matchRules: [{ category: "vulnerability/injection*" }] },
    { code: "CC6.8", name: "Unauthorized Software Prevention", weight: 2.0, matchRules: [{ agent: "dependency", severity: ["critical", "high"] }] },
    { code: "CC7.1", name: "Monitoring and Detection", weight: 2.0, matchRules: [{ category: "vulnerability/*", severity: ["critical"] }] },
    { code: "CC7.2", name: "Anomaly Detection", weight: 1.0, matchRules: [{ agent: "ai-detector" }] },
    { code: "CC8.1", name: "Change Management", weight: 2.0, matchRules: [{ agent: "quality" }] },
    { code: "CC3.1", name: "Risk Assessment", weight: 2.0, matchRules: [{ severity: ["critical", "high", "medium"] }] },
    { code: "CC1.1", name: "COSO Principle 1 — Integrity and Ethics", weight: 1.0, matchRules: [{ agent: "quality", category: "quality/*" }] },
    { code: "CC1.2", name: "Board Oversight", weight: 1.0, matchRules: [{ agent: "policy" }] },
    { code: "CC2.1", name: "Internal Communications", weight: 1.0, matchRules: [{ agent: "quality", category: "quality/documentation*" }] },
    { code: "CC4.1", name: "Monitoring Activities", weight: 2.0, matchRules: [{ severity: ["critical", "high"] }] },
    { code: "CC5.1", name: "Control Activities", weight: 2.0, matchRules: [{ agent: "security" }] },
    { code: "CC5.2", name: "Technology General Controls", weight: 2.0, matchRules: [{ agent: "dependency" }] },
    { code: "CC6.2", name: "Credential Management", weight: 3.0, matchRules: [{ category: "vulnerability/exposure*" }] },
    { code: "CC6.3", name: "Registration and Authorization", weight: 2.0, matchRules: [{ category: "vulnerability/auth*" }] },
    { code: "CC7.3", name: "Vulnerability Remediation", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical", "high", "medium"] }] },
    { code: "CC7.4", name: "Incident Response", weight: 2.0, matchRules: [{ severity: ["critical"] }] },
    { code: "CC5.3", name: "Formal Verification of Critical Logic", weight: 2.0, matchRules: [{ agent: "formal-verification", severity: ["critical", "high"] }] },
  ],
};
