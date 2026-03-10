import type { FrameworkDefinition } from "../types.js";

export const GDPR: FrameworkDefinition = {
  slug: "gdpr",
  name: "GDPR Articles 25 & 32",
  version: "2018",
  category: "regulatory",
  controls: [
    { code: "GDPR-25.1", name: "Data Protection by Design", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical", "high"] }] },
    { code: "GDPR-25.2", name: "Data Protection by Default", weight: 2.0, matchRules: [{ agent: "security", category: "vulnerability/exposure*" }] },
    { code: "GDPR-32.a", name: "Encryption of Personal Data", weight: 3.0, matchRules: [{ category: "vulnerability/crypto*" }] },
    { code: "GDPR-32.b", name: "Confidentiality and Integrity", weight: 2.0, matchRules: [{ agent: "security" }] },
    { code: "GDPR-32.c", name: "Availability and Resilience", weight: 1.0, matchRules: [{ agent: "dependency", severity: ["critical"] }] },
    { code: "GDPR-32.d", name: "Testing and Evaluation", weight: 2.0, matchRules: [{ agent: "quality" }] },
  ],
};
