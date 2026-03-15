import type { FrameworkDefinition } from "../types.js";

export const SLSA: FrameworkDefinition = {
  slug: "slsa",
  name: "SLSA v1.0",
  version: "1.0",
  category: "supply-chain",
  controls: [
    { code: "SLSA-L1.1", name: "Build - Scripted Build", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/build*" }] },
    { code: "SLSA-L1.2", name: "Provenance - Available", weight: 3.0, matchRules: [{ agent: "policy" }] },
    { code: "SLSA-L2.1", name: "Build - Build Service", weight: 2.0, matchRules: [{ agent: "quality" }] },
    { code: "SLSA-L2.2", name: "Provenance - Authenticated", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/supply-chain*" }] },
    { code: "SLSA-L3.1", name: "Build - Hardened Builds", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical"] }] },
    { code: "SLSA-L3.2", name: "Provenance - Unforgeable", weight: 3.0, matchRules: [{ agent: "ip-license" }] },
    { code: "SLSA-L1.3", name: "Source - Version Controlled", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/signing*" }] },
    { code: "SLSA-L2.3", name: "Build - Isolated", weight: 2.0, matchRules: [{ agent: "security", severity: ["critical", "high"] }] },
    { code: "SLSA-L3.3", name: "Formally Verified Build Logic", weight: 2.0, matchRules: [{ agent: "formal-verification" }] },
  ],
};
