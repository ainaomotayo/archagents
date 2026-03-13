import { ApprovalFSM } from "@sentinel/assessor";

const VALID_STRATEGIES = ["risk_threshold", "category_block", "license_review", "always_review"];
const VALID_DECISIONS = ["approve", "reject"];

interface ApprovalRouteDeps {
  db: any;
}

export function buildApprovalRoutes(deps: ApprovalRouteDeps) {
  const { db } = deps;

  // --- Policies ---

  async function createPolicy(orgId: string, body: any) {
    if (!body.name || typeof body.name !== "string") {
      throw new Error("Policy name is required");
    }
    if (!VALID_STRATEGIES.includes(body.strategyType)) {
      throw new Error(`Invalid strategy type: ${body.strategyType}. Must be one of: ${VALID_STRATEGIES.join(", ")}`);
    }
    return db.approvalPolicy.create({
      data: {
        orgId,
        name: body.name,
        strategyType: body.strategyType,
        config: body.config ?? {},
        projectId: body.projectId ?? null,
        enabled: body.enabled ?? true,
        priority: body.priority ?? 0,
        assigneeRole: body.assigneeRole ?? "manager",
        slaHours: body.slaHours ?? 24,
        escalateAfterHours: body.escalateAfterHours ?? 48,
        expiryAction: body.expiryAction ?? "reject",
      },
    });
  }

  async function listPolicies(orgId: string) {
    return db.approvalPolicy.findMany({
      where: { orgId },
      orderBy: { priority: "desc" },
    });
  }

  async function updatePolicy(orgId: string, policyId: string, body: any) {
    const existing = await db.approvalPolicy.findUnique({
      where: { id: policyId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Policy not found");
    }
    const { name, enabled, priority, strategyType, config, assigneeRole,
            slaHours, escalateAfterHours, expiryAction } = body;
    if (strategyType && !VALID_STRATEGIES.includes(strategyType)) {
      throw new Error(`Invalid strategy type: ${strategyType}. Must be one of: ${VALID_STRATEGIES.join(", ")}`);
    }
    return db.approvalPolicy.update({
      where: { id: policyId },
      data: { name, enabled, priority, strategyType, config, assigneeRole,
              slaHours, escalateAfterHours, expiryAction },
    });
  }

  async function deletePolicy(orgId: string, policyId: string) {
    const existing = await db.approvalPolicy.findUnique({
      where: { id: policyId },
    });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Policy not found");
    }
    return db.approvalPolicy.delete({ where: { id: policyId } });
  }

  // --- Gates ---

  async function listPendingGates(orgId: string, opts: { limit?: number; offset?: number } = {}) {
    const { limit = 50, offset = 0 } = opts;
    const [gates, total] = await Promise.all([
      db.approvalGate.findMany({
        where: { orgId, status: { in: ["pending", "escalated"] } },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { requestedAt: "asc" }],
        take: limit,
        skip: offset,
        include: { scan: true, decisions: true },
      }),
      db.approvalGate.count({
        where: { orgId, status: { in: ["pending", "escalated"] } },
      }),
    ]);
    return { gates, total };
  }

  async function getGate(orgId: string, gateId: string) {
    const gate = await db.approvalGate.findUnique({
      where: { id: gateId },
      include: { scan: true, decisions: true },
    });
    if (!gate || gate.orgId !== orgId) return null;
    return gate;
  }

  async function submitDecision(
    orgId: string,
    gateId: string,
    input: { decision: string; justification: string; decidedBy: string },
  ) {
    const gate = await db.approvalGate.findUnique({ where: { id: gateId } });
    if (!gate || gate.orgId !== orgId) {
      throw new Error("Gate not found");
    }

    if (!ApprovalFSM.canDecide(gate.status as any)) {
      throw new Error(`Cannot decide on gate in state "${gate.status}"`);
    }

    if (!VALID_DECISIONS.includes(input.decision)) {
      throw new Error(`Invalid decision: ${input.decision}. Must be one of: ${VALID_DECISIONS.join(", ")}`);
    }

    if (!input.justification || input.justification.length < 10) {
      throw new Error("Justification must be at least 10 characters");
    }

    const action = input.decision as "approve" | "reject";
    const newStatus = ApprovalFSM.transition(gate.status as any, action);

    await db.approvalDecision.create({
      data: {
        gateId,
        orgId,
        decidedBy: input.decidedBy,
        decision: input.decision,
        justification: input.justification,
      },
    });

    const updated = await db.approvalGate.update({
      where: { id: gateId },
      data: { status: newStatus, decidedAt: new Date() },
    });

    // Update scan approval status
    await db.scan.update({
      where: { id: gate.scanId },
      data: { approvalStatus: newStatus },
    });

    return updated;
  }

  async function reassignGate(orgId: string, gateId: string, body: { assignedTo?: string; assignedRole?: string }) {
    const gate = await db.approvalGate.findUnique({ where: { id: gateId } });
    if (!gate || gate.orgId !== orgId) throw new Error("Gate not found");
    if (ApprovalFSM.isTerminal(gate.status as any)) {
      throw new Error("Cannot reassign a terminal gate");
    }
    return db.approvalGate.update({
      where: { id: gateId },
      data: { assignedTo: body.assignedTo, assignedRole: body.assignedRole },
    });
  }

  async function getStats(orgId: string) {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const [pending, escalated, decidedToday, expiringSoon] = await Promise.all([
      db.approvalGate.count({ where: { orgId, status: "pending" } }),
      db.approvalGate.count({ where: { orgId, status: "escalated" } }),
      db.approvalGate.count({
        where: {
          orgId,
          status: { in: ["approved", "rejected"] },
          decidedAt: { gte: todayStart },
        },
      }),
      db.approvalGate.count({
        where: {
          orgId,
          status: { in: ["pending", "escalated"] },
          expiresAt: { lte: fourHoursFromNow },
        },
      }),
    ]);

    // Compute average decision time from today's decided gates
    const decidedGates = await db.approvalGate.findMany({
      where: {
        orgId,
        status: { in: ["approved", "rejected"] },
        decidedAt: { gte: todayStart },
      },
      select: { requestedAt: true, decidedAt: true },
    });

    let avgDecisionTimeHours = 0;
    if (decidedGates.length > 0) {
      const totalMs = decidedGates.reduce((sum: number, g: any) => {
        const req = new Date(g.requestedAt).getTime();
        const dec = new Date(g.decidedAt).getTime();
        return sum + (dec - req);
      }, 0);
      avgDecisionTimeHours = Math.round((totalMs / decidedGates.length / 3_600_000) * 10) / 10;
    }

    return { pending, escalated, decidedToday, avgDecisionTimeHours, expiringSoon };
  }

  return {
    createPolicy,
    listPolicies,
    updatePolicy,
    deletePolicy,
    listPendingGates,
    getGate,
    submitDecision,
    reassignGate,
    getStats,
  };
}
