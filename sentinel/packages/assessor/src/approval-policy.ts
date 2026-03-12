/**
 * Approval Policy Engine — Strategy pattern for evaluating whether a scan
 * requires human approval before certificate issuance.
 *
 * Four built-in strategies:
 * - risk_threshold: Three-band evaluation on risk score
 * - category_block: Hard block on finding category + severity
 * - license_review: Target specific SPDX licenses
 * - always_review:  Blanket gate for specific branches
 */

export interface PolicyConfig {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  strategyType: string;
  config: Record<string, unknown>;
  assigneeRole: string;
  slaHours: number;
  escalateAfterHours: number;
  expiryAction: string;
  projectId: string | null;
}

export interface PolicyInput {
  riskScore: number;
  findings: Array<{
    type?: string;
    severity?: string;
    category?: string;
    licenseDetected?: string;
    [key: string]: unknown;
  }>;
  branch: string;
  projectId: string;
}

export interface ApprovalRequirement {
  required: boolean;
  autoBlock: boolean;
  gateType: string;
  priority: number;
  assigneeRole: string;
  slaHours: number;
  escalateAfterHours: number;
  expiryAction: string;
  triggerCriteria: Record<string, unknown>;
  policyId: string;
  policyName: string;
}

// ---------------------------------------------------------------------------
// Strategy implementations
// ---------------------------------------------------------------------------

function evaluateRiskThreshold(
  input: PolicyInput,
  config: Record<string, unknown>,
): { match: boolean; autoBlock: boolean; criteria: Record<string, unknown> } {
  const autoPassBelow = (config.autoPassBelow as number) ?? 30;
  const autoBlockAbove = (config.autoBlockAbove as number) ?? 70;

  if (input.riskScore < autoPassBelow) {
    return { match: false, autoBlock: false, criteria: {} };
  }

  return {
    match: true,
    autoBlock: input.riskScore >= autoBlockAbove,
    criteria: { riskScore: input.riskScore, autoPassBelow, autoBlockAbove },
  };
}

function evaluateCategoryBlock(
  input: PolicyInput,
  config: Record<string, unknown>,
): { match: boolean; autoBlock: boolean; criteria: Record<string, unknown> } {
  const categories = (config.categories as string[]) ?? [];
  const severities = (config.severities as string[]) ?? [];

  const matchedFindings = input.findings.filter(
    (f) =>
      categories.includes(f.category ?? "") &&
      severities.includes(f.severity ?? ""),
  );

  if (matchedFindings.length === 0) {
    return { match: false, autoBlock: false, criteria: {} };
  }

  return {
    match: true,
    autoBlock: false,
    criteria: {
      matchedCount: matchedFindings.length,
      categories,
      severities,
    },
  };
}

function evaluateLicenseReview(
  input: PolicyInput,
  config: Record<string, unknown>,
): { match: boolean; autoBlock: boolean; criteria: Record<string, unknown> } {
  const licenses = (config.licenses as string[]) ?? [];

  const matchedFindings = input.findings.filter((f) =>
    licenses.includes(f.licenseDetected ?? ""),
  );

  if (matchedFindings.length === 0) {
    return { match: false, autoBlock: false, criteria: {} };
  }

  return {
    match: true,
    autoBlock: false,
    criteria: {
      matchedLicenses: [
        ...new Set(matchedFindings.map((f) => f.licenseDetected)),
      ],
    },
  };
}

function evaluateAlwaysReview(
  input: PolicyInput,
  config: Record<string, unknown>,
): { match: boolean; autoBlock: boolean; criteria: Record<string, unknown> } {
  const branches = (config.branches as string[]) ?? [];

  const matches = branches.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return input.branch.startsWith(prefix);
    }
    return input.branch === pattern;
  });

  if (!matches) {
    return { match: false, autoBlock: false, criteria: {} };
  }

  return {
    match: true,
    autoBlock: false,
    criteria: { branch: input.branch, matchedPattern: branches },
  };
}

const STRATEGIES: Record<
  string,
  (
    input: PolicyInput,
    config: Record<string, unknown>,
  ) => { match: boolean; autoBlock: boolean; criteria: Record<string, unknown> }
> = {
  risk_threshold: evaluateRiskThreshold,
  category_block: evaluateCategoryBlock,
  license_review: evaluateLicenseReview,
  always_review: evaluateAlwaysReview,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate approval policies against scan input. Returns the requirement
 * from the highest-priority matching policy, or null if no approval needed.
 *
 * Policies are filtered (enabled only), then sorted by:
 * 1. Project-specific before org-wide (for same priority)
 * 2. Priority DESC (highest wins)
 */
export function evaluateApprovalPolicies(
  input: PolicyInput,
  policies: PolicyConfig[],
): ApprovalRequirement | null {
  const active = policies.filter((p) => p.enabled);

  // Sort: project-specific first (for same priority), then by priority DESC
  active.sort((a, b) => {
    const aProjectMatch = a.projectId === input.projectId ? 1 : 0;
    const bProjectMatch = b.projectId === input.projectId ? 1 : 0;
    if (aProjectMatch !== bProjectMatch) return bProjectMatch - aProjectMatch;
    return b.priority - a.priority;
  });

  for (const policy of active) {
    const strategy = STRATEGIES[policy.strategyType];
    if (!strategy) continue;

    const result = strategy(input, policy.config);
    if (result.match) {
      return {
        required: true,
        autoBlock: result.autoBlock,
        gateType: policy.strategyType,
        priority: result.autoBlock ? 100 : Math.min(50 + input.riskScore, 99),
        assigneeRole: policy.assigneeRole,
        slaHours: policy.slaHours,
        escalateAfterHours: policy.escalateAfterHours,
        expiryAction: policy.expiryAction,
        triggerCriteria: result.criteria,
        policyId: policy.id,
        policyName: policy.name,
      };
    }
  }

  return null;
}
