export interface MatchRule {
  agent?: string;
  category?: string;
  severity?: string[];
  negate?: boolean;
}

export interface ControlDefinition {
  code: string;
  name: string;
  weight: number;
  matchRules: MatchRule[];
}

export interface FrameworkDefinition {
  slug: string;
  name: string;
  version: string;
  category: "supply-chain" | "governance" | "regulatory";
  controls: ControlDefinition[];
}

export type ComplianceVerdict =
  | "compliant"
  | "partially_compliant"
  | "needs_remediation"
  | "non_compliant";

export interface ControlScore {
  controlCode: string;
  score: number;
  passing: number;
  failing: number;
  total: number;
}

export interface AssessmentResult {
  frameworkSlug: string;
  score: number;
  verdict: ComplianceVerdict;
  controlScores: ControlScore[];
}

export interface FindingInput {
  id: string;
  agentName: string;
  severity: string;
  category: string | null;
  suppressed: boolean;
}
