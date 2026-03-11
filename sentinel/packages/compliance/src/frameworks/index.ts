import type { FrameworkDefinition } from "../types.js";
import { SOC2 } from "./soc2.js";
import { ISO27001 } from "./iso27001.js";
import { EU_AI_ACT } from "./eu-ai-act.js";
import { SLSA } from "./slsa.js";
import { OPENSSF } from "./openssf.js";
import { CIS_SSC } from "./cis.js";
import { GDPR } from "./gdpr.js";

export const BUILT_IN_FRAMEWORKS: FrameworkDefinition[] = [
  SOC2,
  ISO27001,
  EU_AI_ACT,
  SLSA,
  OPENSSF,
  CIS_SSC,
  GDPR,
];

export const FRAMEWORK_MAP = new Map<string, FrameworkDefinition>(
  BUILT_IN_FRAMEWORKS.map((f) => [f.slug, f]),
);
