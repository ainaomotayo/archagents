import { evaluateApprovalPolicies, type PolicyConfig } from "@sentinel/assessor";

interface GateCheckInput {
  orgId: string;
  scanId: string;
  projectId: string;
  riskScore: number;
  findings: any[];
  branch: string;
  db: any; // PrismaClient
}

/**
 * Check whether a scan requires an approval gate. Loads policies from DB,
 * evaluates them against the scan, returns the requirement or null.
 */
export async function shouldCreateApprovalGate(input: GateCheckInput) {
  const policies = await input.db.approvalPolicy.findMany({
    where: { orgId: input.orgId, enabled: true },
  });

  if (policies.length === 0) return null;

  const policyConfigs: PolicyConfig[] = policies.map((p: any) => ({
    id: p.id,
    name: p.name,
    enabled: p.enabled,
    priority: p.priority,
    strategyType: p.strategyType,
    config: p.config as Record<string, unknown>,
    assigneeRole: p.assigneeRole,
    slaHours: p.slaHours,
    escalateAfterHours: p.escalateAfterHours,
    expiryAction: p.expiryAction,
    projectId: p.projectId,
  }));

  return evaluateApprovalPolicies(
    {
      riskScore: input.riskScore,
      findings: input.findings,
      branch: input.branch,
      projectId: input.projectId,
    },
    policyConfigs,
  );
}
