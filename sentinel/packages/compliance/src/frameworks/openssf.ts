import type { FrameworkDefinition } from "../types.js";

export const OPENSSF: FrameworkDefinition = {
  slug: "openssf",
  name: "OpenSSF Scorecard",
  version: "4.0",
  category: "supply-chain",
  controls: [
    { code: "OSS-VUL", name: "Vulnerabilities", weight: 3.0, matchRules: [{ category: "vulnerability/*" }] },
    { code: "OSS-DEP", name: "Dependency Update Tool", weight: 2.0, matchRules: [{ agent: "dependency", category: "dependency/outdated" }] },
    { code: "OSS-LIC", name: "License", weight: 2.0, matchRules: [{ agent: "ip-license" }] },
    { code: "OSS-SEC", name: "Security Policy", weight: 1.0, matchRules: [{ agent: "policy" }] },
    { code: "OSS-REV", name: "Code Review", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/review*" }] },
    { code: "OSS-MNT", name: "Maintained", weight: 1.0, matchRules: [{ agent: "dependency" }] },
    { code: "OSS-PIN", name: "Pinned Dependencies", weight: 2.0, matchRules: [{ agent: "dependency", category: "dependency/unpinned*" }] },
    { code: "OSS-BRN", name: "Branch Protection", weight: 2.0, matchRules: [{ agent: "security", category: "vulnerability/supply-chain*" }] },
    { code: "OSS-FUZ", name: "Fuzzing", weight: 1.0, matchRules: [{ agent: "quality", category: "quality/review*" }] },
    { code: "OSS-SAT", name: "SAST", weight: 2.0, matchRules: [{ agent: "security" }] },
  ],
};
