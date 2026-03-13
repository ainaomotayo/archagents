import type { EventBus } from "@sentinel/events";
import type { AuditLog } from "@sentinel/audit";
import { canTransition, TERMINAL_STATUSES, type ApprovalStatus } from "./fsm.js";

interface ApprovalDeps {
  db: any; // PrismaClient
  eventBus: EventBus;
  auditLog: AuditLog;
}

export function buildApprovalRoutes(deps: ApprovalDeps) {
  const { db, eventBus, auditLog } = deps;

  async function listGates(opts: {
    orgId: string;
    limit: number;
    offset: number;
    status?: string;
  }) {
    const where: any = { orgId: opts.orgId };
    if (opts.status) where.status = opts.status;

    const [gates, total] = await Promise.all([
      db.approvalGate.findMany({
        where,
        take: opts.limit,
        skip: opts.offset,
        orderBy: [
          { status: "asc" },        // escalated (alphabetically first) before pending
          { priority: "desc" },     // higher priority first
          { expiresAt: "asc" },     // soonest expiry first (SLA urgency)
          { requestedAt: "asc" },   // oldest first as tiebreaker
        ],
        include: {
          scan: { select: { commitHash: true, branch: true, riskScore: true, _count: { select: { findings: true } } } },
          project: { select: { name: true } },
          decisions: { orderBy: { decidedAt: "asc" } },
        },
      }),
      db.approvalGate.count({ where }),
    ]);

    return { gates, total, limit: opts.limit, offset: opts.offset };
  }

  async function getGate(gateId: string, orgId: string) {
    return db.approvalGate.findFirst({
      where: { id: gateId, orgId },
      include: {
        scan: { select: { commitHash: true, branch: true, riskScore: true, _count: { select: { findings: true } } } },
        project: { select: { name: true } },
        decisions: { orderBy: { decidedAt: "asc" } },
      },
    });
  }

  async function decideGate(opts: {
    gateId: string;
    orgId: string;
    decidedBy: string;
    decision: "approve" | "reject";
    justification: string;
  }): Promise<{ error?: string; status?: number; gate?: any }> {
    const gate = await db.approvalGate.findFirst({ where: { id: opts.gateId, orgId: opts.orgId } });
    if (!gate) return { error: "Gate not found", status: 404 };

    const targetStatus: ApprovalStatus = opts.decision === "approve" ? "approved" : "rejected";
    if (!canTransition(gate.status as ApprovalStatus, targetStatus)) {
      return {
        error: `Gate is already '${gate.status}' and cannot be ${opts.decision}d`,
        status: 409,
      };
    }

    const now = new Date();

    await db.approvalDecision.create({
      data: {
        gateId: opts.gateId,
        orgId: opts.orgId,
        decidedBy: opts.decidedBy,
        decision: opts.decision,
        justification: opts.justification,
        decidedAt: now,
      },
    });

    const updated = await db.approvalGate.update({
      where: { id: opts.gateId },
      data: { status: targetStatus, decidedAt: now },
      include: {
        scan: { select: { commitHash: true, branch: true, riskScore: true, _count: { select: { findings: true } } } },
        project: { select: { name: true } },
        decisions: { orderBy: { decidedAt: "asc" } },
      },
    });

    await auditLog.append(opts.orgId, {
      actor: { type: "user", id: opts.decidedBy, name: opts.decidedBy },
      action: `approval.${opts.decision}d`,
      resource: { type: "approval_gate", id: opts.gateId },
      detail: { decision: opts.decision, justification: opts.justification },
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${opts.gateId}-${opts.decision}d`,
      orgId: opts.orgId,
      topic: "gate.decided",
      payload: updated,
      timestamp: now.toISOString(),
    });

    return { gate: updated };
  }

  async function getStats(orgId: string) {
    const [pending, escalated, decidedToday, expiringSoon] = await Promise.all([
      db.approvalGate.count({ where: { orgId, status: "pending" } }),
      db.approvalGate.count({ where: { orgId, status: "escalated" } }),
      db.approvalGate.count({
        where: {
          orgId,
          status: { in: ["approved", "rejected"] },
          decidedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      db.approvalGate.count({
        where: {
          orgId,
          status: { in: ["pending", "escalated"] },
          expiresAt: { lte: new Date(Date.now() + 4 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Compute average decision time from today's decided gates
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
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

  async function reassignGate(opts: {
    gateId: string;
    orgId: string;
    assignTo: string;
  }): Promise<{ error?: string; status?: number; gate?: any }> {
    const gate = await db.approvalGate.findFirst({ where: { id: opts.gateId, orgId: opts.orgId } });
    if (!gate) return { error: "Gate not found", status: 404 };

    if (TERMINAL_STATUSES.includes(gate.status as ApprovalStatus)) {
      return { error: `Gate is already '${gate.status}' and cannot be reassigned`, status: 409 };
    }

    const updated = await db.approvalGate.update({
      where: { id: opts.gateId },
      data: { assignedTo: opts.assignTo },
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${opts.gateId}-reassigned`,
      orgId: opts.orgId,
      topic: "gate.reassigned",
      payload: updated,
      timestamp: new Date().toISOString(),
    });

    return { gate: updated };
  }

  async function createGate(opts: {
    orgId: string;
    scanId: string;
    projectId: string;
    gateType: string;
    triggerCriteria?: Record<string, unknown>;
    priority?: number;
    assignedRole?: string;
    requestedBy: string;
    expiresInHours?: number;
    escalatesInHours?: number;
    expiryAction?: string;
  }) {
    const now = new Date();
    const expiresInMs = (opts.expiresInHours ?? 24) * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + expiresInMs);
    const escalatesAt = opts.escalatesInHours
      ? new Date(now.getTime() + opts.escalatesInHours * 60 * 60 * 1000)
      : null;

    const gate = await db.approvalGate.create({
      data: {
        orgId: opts.orgId,
        scanId: opts.scanId,
        projectId: opts.projectId,
        gateType: opts.gateType,
        triggerCriteria: opts.triggerCriteria ?? {},
        priority: opts.priority ?? 0,
        assignedRole: opts.assignedRole ?? null,
        requestedBy: opts.requestedBy,
        expiresAt,
        escalatesAt,
        expiryAction: opts.expiryAction ?? "reject",
      },
      include: {
        scan: { select: { commitHash: true, branch: true, riskScore: true, _count: { select: { findings: true } } } },
        project: { select: { name: true } },
        decisions: true,
      },
    });

    await eventBus.publish("sentinel.notifications", {
      id: `evt-${gate.id}-created`,
      orgId: opts.orgId,
      topic: "gate.created",
      payload: gate,
      timestamp: now.toISOString(),
    });

    return gate;
  }

  return { listGates, getGate, decideGate, getStats, reassignGate, createGate };
}
