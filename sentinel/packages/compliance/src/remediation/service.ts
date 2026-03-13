import { computePriorityScore } from "./priority-score.js";

const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "accepted_risk"],
  in_progress: ["completed", "accepted_risk", "open"],
  completed: [],
  accepted_risk: [],
};

const VALID_PRIORITIES = ["critical", "high", "medium", "low"];
const VALID_ITEM_TYPES = ["compliance", "finding"];

export interface CreateRemediationInput {
  frameworkSlug?: string;
  controlCode?: string;
  title: string;
  description: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: Date;
  linkedFindingIds?: string[];
  createdBy: string;
  parentId?: string;
  findingId?: string;
  itemType?: string;
}

export interface UpdateRemediationInput {
  status?: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: Date;
  completedBy?: string;
  evidenceNotes?: string;
}

export class RemediationService {
  constructor(private db: any) {}

  async create(orgId: string, input: CreateRemediationInput) {
    // Validate parent if provided
    if (input.parentId) {
      const parent = await this.db.remediationItem.findUnique({ where: { id: input.parentId } });
      if (!parent || parent.orgId !== orgId) {
        throw new Error("Parent item not found");
      }
      if (parent.itemType !== "compliance") {
        throw new Error("Parent must be a compliance-type item");
      }
      if (parent.parentId) {
        throw new Error("Maximum nesting depth is 2");
      }
    }

    const itemType = input.itemType ?? "compliance";
    if (!VALID_ITEM_TYPES.includes(itemType)) {
      throw new Error(`Invalid item type: ${itemType}`);
    }

    const priority = input.priority ?? "medium";
    const linkedFindingIds = input.linkedFindingIds ?? [];
    const priorityScore = computePriorityScore({
      priority,
      dueDate: input.dueDate ?? null,
      linkedFindingIds,
      findingId: input.findingId ?? null,
    });

    const item = await this.db.remediationItem.create({
      data: {
        orgId,
        frameworkSlug: input.frameworkSlug,
        controlCode: input.controlCode,
        title: input.title,
        description: input.description,
        status: "open",
        priority,
        assignedTo: input.assignedTo,
        dueDate: input.dueDate,
        linkedFindingIds,
        createdBy: input.createdBy,
        parentId: input.parentId,
        findingId: input.findingId,
        itemType,
        priorityScore,
      },
    });

    // Update parent score if this is a child
    if (input.parentId) {
      await this.rollUpParentScore(input.parentId);
    }

    return item;
  }

  async update(orgId: string, id: string, input: UpdateRemediationInput) {
    const existing = await this.db.remediationItem.findUnique({ where: { id } });
    if (!existing || existing.orgId !== orgId) {
      throw new Error("Remediation item not found");
    }

    if (input.status) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(input.status)) {
        throw new Error(`Invalid status transition from ${existing.status} to ${input.status}`);
      }
    }

    const data: any = {};
    if (input.status) data.status = input.status;
    if (input.priority) data.priority = input.priority;
    if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate;
    if (input.evidenceNotes !== undefined) data.evidenceNotes = input.evidenceNotes;

    if (input.status === "completed") {
      data.completedAt = new Date();
      data.completedBy = input.completedBy;
    }

    // Recompute score if priority or dueDate changed
    if (input.priority || input.dueDate !== undefined) {
      data.priorityScore = computePriorityScore({
        priority: input.priority ?? existing.priority,
        dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
        linkedFindingIds: existing.linkedFindingIds ?? [],
        findingId: existing.findingId ?? null,
      });
    }

    const updated = await this.db.remediationItem.update({ where: { id }, data });

    // Roll up parent score if this item has a parent
    if (existing.parentId) {
      await this.rollUpParentScore(existing.parentId);
    }

    return updated;
  }

  async getById(orgId: string, id: string) {
    const item = await this.db.remediationItem.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!item || item.orgId !== orgId) return null;
    return item;
  }

  async getStats(orgId: string) {
    const [open, inProgress, overdue, completed, acceptedRisk] = await Promise.all([
      this.db.remediationItem.count({ where: { orgId, status: "open" } }),
      this.db.remediationItem.count({ where: { orgId, status: "in_progress" } }),
      this.db.remediationItem.count({ where: { orgId, status: { in: ["open", "in_progress"] }, dueDate: { lt: new Date() } } }),
      this.db.remediationItem.count({ where: { orgId, status: "completed" } }),
      this.db.remediationItem.count({ where: { orgId, status: "accepted_risk" } }),
    ]);

    // Avg resolution time
    const completedItems = await this.db.remediationItem.findMany({
      where: { orgId, status: "completed", completedAt: { not: null } },
      select: { createdAt: true, completedAt: true, dueDate: true },
    });

    let avgResolutionDays = 0;
    let slaCompliance = 100;

    if (completedItems.length > 0) {
      const totalMs = completedItems.reduce((sum: number, item: any) => {
        return sum + (new Date(item.completedAt).getTime() - new Date(item.createdAt).getTime());
      }, 0);
      avgResolutionDays = Math.round(totalMs / completedItems.length / 86400000);

      const withDueDate = completedItems.filter((i: any) => i.dueDate);
      if (withDueDate.length > 0) {
        const onTime = withDueDate.filter((i: any) => new Date(i.completedAt) <= new Date(i.dueDate));
        slaCompliance = Math.round((onTime.length / withDueDate.length) * 100);
      }
    }

    return { open, inProgress, overdue, completed, acceptedRisk, avgResolutionDays, slaCompliance };
  }

  async linkExternal(orgId: string, id: string, externalRef: string) {
    const item = await this.db.remediationItem.findUnique({ where: { id } });
    if (!item || item.orgId !== orgId) {
      throw new Error("Remediation item not found");
    }
    if (item.externalRef) {
      throw new Error(`Item already linked to ${item.externalRef}`);
    }
    return this.db.remediationItem.update({ where: { id }, data: { externalRef } });
  }

  async list(orgId: string, filters: { frameworkSlug?: string; status?: string; itemType?: string; parentId?: string } = {}) {
    const where: any = { orgId };
    if (filters.frameworkSlug) where.frameworkSlug = filters.frameworkSlug;
    if (filters.status) where.status = filters.status;
    if (filters.itemType) where.itemType = filters.itemType;
    if (filters.parentId !== undefined) where.parentId = filters.parentId;
    return this.db.remediationItem.findMany({
      where,
      include: { children: true },
      orderBy: { priorityScore: "desc" },
    });
  }

  async getOverdue(orgId: string) {
    return this.db.remediationItem.findMany({
      where: {
        orgId,
        status: { in: ["open", "in_progress"] },
        dueDate: { lt: new Date() },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  private async rollUpParentScore(parentId: string) {
    const children = await this.db.remediationItem.findMany({
      where: { parentId },
      select: { priorityScore: true },
    });

    const maxChildScore = Math.max(0, ...children.map((c: any) => c.priorityScore ?? 0));
    await this.db.remediationItem.update({
      where: { id: parentId },
      data: { priorityScore: maxChildScore },
    });
  }
}
