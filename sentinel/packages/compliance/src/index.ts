export type {
  MatchRule,
  ControlDefinition,
  FrameworkDefinition,
  ComplianceVerdict,
  ControlScore,
  AssessmentResult,
  FindingInput,
} from "./types.js";

export { matchFindings } from "./matchers/rule-matcher.js";

export { scoreControl, scoreFramework, resolveVerdict } from "./scoring/engine.js";

export { BUILT_IN_FRAMEWORKS, FRAMEWORK_MAP } from "./frameworks/index.js";
export { computeEvidenceHash, verifyEvidenceChain, type ChainRecord, type ChainVerification } from "./evidence/chain.js";
