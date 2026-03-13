const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "accepted_risk"],
  in_progress: ["completed", "accepted_risk", "open"],
  completed: [],
  accepted_risk: [],
};

export interface CreateRemediationInput {
  frameworkSlug: string;
  controlCode: string;
  title: string;
  description: string;
  priority?: string;
  assignedTo?: string;
  dueDate?: Date;
  linkedFindingIds?: string[];
  createdBy: string;
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
    return this.db.remediationItem.create({
      data: {
        orgId,
        frameworkSlug: input.frameworkSlug,
        controlCode: input.controlCode,
        title: input.title,
        description: input.description,
        status: "open",
        priority: input.priority ?? "medium",
        assignedTo: input.assignedTo,
        dueDate: input.dueDate,
        linkedFindingIds: input.linkedFindingIds ?? [],
        createdBy: input.createdBy,
      },
    });
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

    return this.db.remediationItem.update({ where: { id }, data });
  }

  async list(orgId: string, filters: { frameworkSlug?: string; status?: string } = {}) {
    const where: any = { orgId };
    if (filters.frameworkSlug) where.frameworkSlug = filters.frameworkSlug;
    if (filters.status) where.status = filters.status;
    return this.db.remediationItem.findMany({ where, orderBy: { createdAt: "desc" } });
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
}
