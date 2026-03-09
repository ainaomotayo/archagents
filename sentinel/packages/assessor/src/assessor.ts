import { randomUUID } from "node:crypto";
import type {
  Finding,
  FindingEvent,
  ComplianceAssessment,
  AgentResult,
  FindingType,
  CategoryScore,
} from "@sentinel/shared";
import { calculateRiskScore, determineStatus } from "./risk-scorer.js";
import { generateCertificate } from "./certificate.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssessInput {
  scanId: string;
  projectId: string;
  commitHash: string;
  findingEvents: FindingEvent[];
  /** Whether any agents timed out */
  hasTimeouts: boolean;
  /** Secret used for certificate HMAC signing */
  orgSecret: string;
}

export interface AssessorConfig {
  /** Timeout in ms to wait for all agents (default 30_000) */
  timeoutMs?: number;
}

// Default empty category score used when no findings exist for ai-detection
const EMPTY_CATEGORY_SCORE: CategoryScore = {
  score: 0,
  status: "pass",
  findings: { critical: 0, high: 0, medium: 0, low: 0 },
};

// The five categories stored on ComplianceAssessment (ai-detection is folded
// into the risk score but not a named key on the assessment type)
const ASSESSMENT_CATEGORIES: Array<
  "security" | "license" | "quality" | "policy" | "dependency"
> = ["security", "license", "quality", "policy", "dependency"];

// ---------------------------------------------------------------------------
// Assessor
// ---------------------------------------------------------------------------

export class Assessor {
  private config: Required<AssessorConfig>;

  constructor(config: AssessorConfig = {}) {
    this.config = {
      timeoutMs: config.timeoutMs ?? 30_000,
    };
  }

  /**
   * Run a full compliance assessment from collected finding events.
   */
  assess(input: AssessInput): ComplianceAssessment {
    const allFindings = this.mergeFindings(input.findingEvents);
    const agentResults = this.mergeAgentResults(input.findingEvents);

    const { score, categories } = calculateRiskScore({
      findings: allFindings,
      agentResults,
    });

    const status = determineStatus(score, categories, input.hasTimeouts);

    const assessment: ComplianceAssessment = {
      id: randomUUID(),
      commitHash: input.commitHash,
      projectId: input.projectId,
      timestamp: new Date().toISOString(),
      status,
      riskScore: score,
      categories: this.pickAssessmentCategories(categories),
      findings: allFindings,
      agentResults,
      drift: {
        aiComposition: {
          thisCommit: 0,
          projectBaseline: 0,
          deviationFactor: 0,
          riskFlag: false,
          trend: "stable",
        },
        dependencyDrift: {
          newDeps: [],
          categoryConflicts: [],
        },
      },
    };

    // Generate and attach certificate
    const certJson = generateCertificate(assessment, input.orgSecret);
    assessment.certificate = JSON.parse(certJson);

    return assessment;
  }

  /**
   * Re-evaluate an existing assessment with additional findings (e.g. from
   * LLM review). This is idempotent: the same extra findings produce the
   * same result.
   */
  reEvaluate(
    existingAssessment: ComplianceAssessment,
    newFindings: Finding[],
    orgSecret: string,
  ): ComplianceAssessment {
    const allFindings = [...existingAssessment.findings, ...newFindings];
    const agentResults = existingAssessment.agentResults;

    const hasTimeouts = agentResults.some((ar) => ar.status === "timeout");

    const { score, categories } = calculateRiskScore({
      findings: allFindings,
      agentResults,
    });

    const status = determineStatus(score, categories, hasTimeouts);

    const updated: ComplianceAssessment = {
      ...existingAssessment,
      timestamp: new Date().toISOString(),
      status,
      riskScore: score,
      categories: this.pickAssessmentCategories(categories),
      findings: allFindings,
    };

    const certJson = generateCertificate(updated, orgSecret);
    updated.certificate = JSON.parse(certJson);

    return updated;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private mergeFindings(events: FindingEvent[]): Finding[] {
    return events.flatMap((e) => e.findings);
  }

  private mergeAgentResults(events: FindingEvent[]): AgentResult[] {
    return events.map((e) => e.agentResult);
  }

  /**
   * Map the full category record (including ai-detection) to the five
   * categories stored on ComplianceAssessment.
   */
  private pickAssessmentCategories(
    all: Record<FindingType, CategoryScore>,
  ): ComplianceAssessment["categories"] {
    return {
      security: all.security,
      license: all.license,
      quality: all.quality,
      policy: all.policy,
      dependency: all.dependency,
    };
  }
}
