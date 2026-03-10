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
