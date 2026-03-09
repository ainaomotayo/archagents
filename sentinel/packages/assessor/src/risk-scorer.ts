import type {
  Finding,
  FindingType,
  Severity,
  CategoryScore,
  AssessmentStatus,
  AgentResult,
} from "@sentinel/shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_WEIGHTS: Record<Exclude<Severity, "info">, number> = {
  critical: 40,
  high: 15,
  medium: 5,
  low: 1,
};

const CATEGORY_WEIGHTS: Record<FindingType, number> = {
  security: 0.3,
  license: 0.2,
  quality: 0.15,
  policy: 0.15,
  dependency: 0.15,
  "ai-detection": 0.05,
};

const ALL_CATEGORIES: FindingType[] = [
  "security",
  "license",
  "quality",
  "policy",
  "dependency",
  "ai-detection",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RiskInput {
  findings: Finding[];
  agentResults: AgentResult[];
}

export interface RiskOutput {
  score: number;
  categories: Record<FindingType, CategoryScore>;
}

/**
 * Calculate a weighted risk score (0-100) from findings and agent results.
 */
export function calculateRiskScore(input: RiskInput): RiskOutput {
  const categories = {} as Record<FindingType, CategoryScore>;

  for (const cat of ALL_CATEGORIES) {
    const catFindings = input.findings.filter((f) => f.type === cat);
    const counts = countBySeverity(catFindings);
    const rawScore = computeRawCategoryScore(counts);
    // Cap individual category score at 100 before weighting
    const cappedScore = Math.min(rawScore, 100);

    categories[cat] = {
      score: cappedScore,
      status: categoryStatus(cappedScore, counts.critical),
      findings: counts,
    };
  }

  // Weighted sum across categories
  let score = 0;
  for (const cat of ALL_CATEGORIES) {
    score += categories[cat].score * CATEGORY_WEIGHTS[cat];
  }
  score = Math.round(Math.min(score, 100));

  return { score, categories };
}

/**
 * Determine the overall assessment status from the risk score, category
 * breakdown, and whether any agents timed out.
 */
export function determineStatus(
  score: number,
  categories: Record<FindingType, CategoryScore>,
  hasTimeouts: boolean,
): AssessmentStatus {
  const hasCritical = ALL_CATEGORIES.some(
    (cat) => categories[cat].findings.critical > 0,
  );

  if (hasTimeouts && !hasCritical && score < 60) {
    return "partial";
  }
  if (hasCritical || score >= 60) {
    return "fail";
  }
  if (score < 30) {
    return "full_pass";
  }
  return "provisional_pass";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBySeverity(findings: Finding[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity === "info") continue;
    counts[f.severity]++;
  }
  return counts;
}

function computeRawCategoryScore(counts: {
  critical: number;
  high: number;
  medium: number;
  low: number;
}): number {
  return (
    counts.critical * SEVERITY_WEIGHTS.critical +
    counts.high * SEVERITY_WEIGHTS.high +
    counts.medium * SEVERITY_WEIGHTS.medium +
    counts.low * SEVERITY_WEIGHTS.low
  );
}

function categoryStatus(
  score: number,
  criticalCount: number,
): "pass" | "warn" | "fail" | "error" {
  if (criticalCount > 0 || score >= 60) return "fail";
  if (score >= 30) return "warn";
  return "pass";
}
