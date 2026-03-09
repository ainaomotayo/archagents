// === Diff Payload Types ===

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  content: string;
}

export interface ScanConfig {
  securityLevel: "standard" | "strict" | "audit";
  licensePolicy: string;
  qualityThreshold: number;
}

export interface SentinelDiffPayload {
  projectId: string;
  commitHash: string;
  branch: string;
  author: string;
  timestamp: string;
  files: Array<{
    path: string;
    language: string;
    hunks: DiffHunk[];
    aiScore: number;
  }>;
  toolHints?: {
    tool?: string;
    markers?: string[];
  };
  scanConfig: ScanConfig;
}

// === Finding Types ===

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Confidence = "high" | "medium" | "low";
export type FindingType = "security" | "license" | "quality" | "policy" | "dependency" | "ai-detection";

interface BaseFinding {
  type: FindingType;
  file: string;
  lineStart: number;
  lineEnd: number;
  severity: Severity;
  confidence: Confidence;
}

export interface SecurityFinding extends BaseFinding {
  type: "security";
  category: string;
  title: string;
  description: string;
  remediation: string;
  scanner: "semgrep" | "custom-rules" | "llm-review";
  cweId: string | null;
}

export interface LicenseFinding extends BaseFinding {
  type: "license";
  findingType: "copyleft-risk" | "unknown-license" | "policy-violation" | "attribution-required";
  licenseDetected: string | null;
  similarityScore: number;
  sourceMatch: string | null;
  policyAction: "block" | "review" | "allow";
}

export interface QualityFinding extends BaseFinding {
  type: "quality";
  metric: "complexity" | "duplication" | "test-gap" | "naming" | "dead-code";
  score: number;
  detail: string;
  suggestion: string | null;
}

export interface PolicyFinding extends BaseFinding {
  type: "policy";
  policyName: string;
  policySource: "repo" | "org" | "inferred";
  violation: string;
  requiredAlternative: string | null;
}

export interface DependencyFinding extends BaseFinding {
  type: "dependency";
  package: string;
  findingType: "cve" | "architectural-drift" | "typosquat" | "unmaintained" | "policy-blocked";
  detail: string;
  existingAlternative: string | null;
  cveId: string | null;
}

export interface AIDetectionFinding extends BaseFinding {
  type: "ai-detection";
  aiProbability: number;
  detectionMethod: string;
  toolAttribution: string | null;
}

export type Finding =
  | SecurityFinding
  | LicenseFinding
  | QualityFinding
  | PolicyFinding
  | DependencyFinding
  | AIDetectionFinding;

// === Assessment Types ===

export interface CategoryScore {
  score: number;
  status: "pass" | "warn" | "fail" | "error";
  findings: { critical: number; high: number; medium: number; low: number };
}

export type AssessmentStatus = "full_pass" | "provisional_pass" | "fail" | "revoked" | "partial";

export interface ComplianceAssessment {
  id: string;
  commitHash: string;
  projectId: string;
  timestamp: string;
  status: AssessmentStatus;
  riskScore: number;
  categories: {
    security: CategoryScore;
    license: CategoryScore;
    quality: CategoryScore;
    policy: CategoryScore;
    dependency: CategoryScore;
  };
  findings: Finding[];
  agentResults: AgentResult[];
  drift: {
    aiComposition: {
      thisCommit: number;
      projectBaseline: number;
      deviationFactor: number;
      riskFlag: boolean;
      trend: "increasing" | "stable" | "decreasing";
    };
    dependencyDrift: {
      newDeps: string[];
      categoryConflicts: Array<{
        category: string;
        existing: string;
        introduced: string;
      }>;
    };
  };
  certificate?: ComplianceCertificate;
}

// === Certificate Types ===

export interface ComplianceCertificate {
  id: string;
  version: "1.0";
  subject: {
    projectId: string;
    repository: string;
    commitHash: string;
    branch: string;
    author: string;
    timestamp: string;
  };
  verdict: {
    status: "pass" | "provisional" | "fail";
    riskScore: number;
    categories: Record<string, "pass" | "warn" | "fail">;
  };
  scanMetadata: {
    agents: Array<{
      name: string;
      version: string;
      rulesetVersion: string;
      rulesetHash: string;
      status: "completed" | "error" | "timeout";
      findingCount: number;
      durationMs: number;
    }>;
    environmentHash: string;
    totalDurationMs: number;
    scanLevel: "standard" | "strict" | "audit";
  };
  compliance: {
    euAiAct?: {
      riskCategory: string;
      documentationComplete: boolean;
      humanOversightVerified: boolean;
    };
    soc2?: { controlsMapped: string[] };
    iso27001?: { controlsMapped: string[] };
  };
  signature: string;
  issuedAt: string;
  expiresAt: string;
}

// === Agent Types ===

export type AgentStatus = "completed" | "error" | "timeout";

export interface AgentResult {
  agentName: string;
  agentVersion: string;
  rulesetVersion: string;
  rulesetHash: string;
  status: AgentStatus;
  findingCount: number;
  durationMs: number;
  errorDetail?: string;
}

// === Audit Types ===

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: {
    type: "system" | "user" | "agent" | "api";
    id: string;
    name: string;
    ip?: string;
  };
  action: string;
  resource: {
    type: "scan" | "certificate" | "finding" | "policy" | "project";
    id: string;
  };
  detail: Record<string, unknown>;
  previousEventHash: string;
  eventHash: string;
}

// === Event Bus Types ===

export interface DiffEvent {
  scanId: string;
  payload: SentinelDiffPayload;
  submittedAt: string;
}

export interface FindingEvent {
  scanId: string;
  agentName: string;
  findings: Finding[];
  agentResult: AgentResult;
}

export interface ReEvaluateEvent {
  type: "RE_EVALUATE";
  scanId: string;
  agentName: string;
  findings: Finding[];
  triggeredAt: string;
}

export interface ScanResultEvent {
  scanId: string;
  assessment: ComplianceAssessment;
}
