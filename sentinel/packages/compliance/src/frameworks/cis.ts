import type { FrameworkDefinition } from "../types.js";

export const CIS_SSC: FrameworkDefinition = {
  slug: "cis-ssc",
  name: "CIS Software Supply Chain Security",
  version: "1.0",
  category: "supply-chain",
  controls: [
    { code: "CIS-SC-1.1", name: "Source Code Integrity", weight: 3.0, matchRules: [{ agent: "security", category: "vulnerability/supply-chain*" }] },
    { code: "CIS-SC-1.2", name: "Signed Commits", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/signing*" }] },
    { code: "CIS-SC-2.1", name: "Build Pipeline Security", weight: 3.0, matchRules: [{ category: "vulnerability/*", severity: ["critical", "high"] }] },
    { code: "CIS-SC-3.1", name: "Dependency Provenance", weight: 2.0, matchRules: [{ agent: "dependency" }] },
    { code: "CIS-SC-3.2", name: "Vulnerability Scanning", weight: 3.0, matchRules: [{ agent: "security" }] },
    { code: "CIS-SC-4.1", name: "Artifact Integrity", weight: 2.0, matchRules: [{ agent: "ip-license" }] },
    { code: "CIS-SC-5.1", name: "Deployment Security", weight: 2.0, matchRules: [{ severity: ["critical"] }] },
  ],
};
