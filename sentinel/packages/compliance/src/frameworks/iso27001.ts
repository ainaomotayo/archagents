import type { FrameworkDefinition } from "../types.js";

export const ISO27001: FrameworkDefinition = {
  slug: "iso27001",
  name: "ISO 27001:2022",
  version: "2022",
  category: "governance",
  controls: [
    { code: "A.8.8", name: "Management of Technical Vulnerabilities", weight: 3.0, matchRules: [{ category: "vulnerability/*" }] },
    { code: "A.8.9", name: "Configuration Management", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/*" }] },
    { code: "A.8.25", name: "Secure Development Lifecycle", weight: 2.0, matchRules: [{ agent: "security" }] },
    { code: "A.8.26", name: "Application Security Requirements", weight: 2.0, matchRules: [{ category: "vulnerability/injection*" }] },
    { code: "A.8.28", name: "Secure Coding", weight: 3.0, matchRules: [{ severity: ["critical", "high"] }] },
    { code: "A.5.23", name: "Information Security for Cloud Services", weight: 1.0, matchRules: [{ category: "vulnerability/cloud*" }] },
    { code: "A.8.6", name: "Capacity Management", weight: 1.0, matchRules: [{ agent: "dependency", category: "dependency/outdated" }] },
  ],
};
