import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemediationService } from "../remediation/service.js";

const mockDb = {
  remediationItem: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  workflowConfig: {
    findUnique: vi.fn().mockResolvedValue(null),
  },
};

describe("RemediationService", () => {
  let service: RemediationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RemediationService(mockDb as any);
  });

  it("creates a remediation item", async () => {
    mockDb.remediationItem.create.mockResolvedValue({
      id: "rem-1", title: "Fix encryption gap", status: "open",
    });

    const result = await service.create("org-1", {
      frameworkSlug: "hipaa",
      controlCode: "TS-1.4",
      title: "Fix encryption gap",
      description: "TS-1.4 requires encryption at rest",
      priority: "high",
      createdBy: "user-1",
    });

    expect(result).toHaveProperty("id", "rem-1");
    expect(mockDb.remediationItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "open", orgId: "org-1" }),
      }),
    );
  });

  it("updates status from open to assigned", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open",
    });
    mockDb.remediationItem.update.mockResolvedValue({
      id: "rem-1", status: "assigned",
    });

    const result = await service.update("org-1", "rem-1", { status: "assigned" });
    expect(result.status).toBe("assigned");
  });

  it("updates status to completed with completedBy", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "awaiting_deployment",
    });
    mockDb.remediationItem.update.mockResolvedValue({
      id: "rem-1", status: "completed",
    });

    const result = await service.update("org-1", "rem-1", {
      status: "completed",
      completedBy: "user-1",
    });
    expect(result.status).toBe("completed");
  });

  it("rejects invalid status transition", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "completed",
    });

    await expect(
      service.update("org-1", "rem-1", { status: "open" }),
    ).rejects.toThrow("transition");
  });

  it("lists by framework and status filter", async () => {
    mockDb.remediationItem.findMany.mockResolvedValue([
      { id: "rem-1", status: "open" },
    ]);

    const result = await service.list("org-1", { frameworkSlug: "hipaa", status: "open" });
    expect(result).toHaveLength(1);
    expect(mockDb.remediationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1", frameworkSlug: "hipaa", status: "open" }),
      }),
    );
  });

  it("getOverdue returns past-due items", async () => {
    mockDb.remediationItem.findMany.mockResolvedValue([
      { id: "rem-1", dueDate: new Date(Date.now() - 86400000), status: "open" },
    ]);

    const result = await service.getOverdue("org-1");
    expect(result).toHaveLength(1);
    expect(mockDb.remediationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1",
          status: { in: ["open", "in_progress"] },
        }),
      }),
    );
  });

  // --- Parent-child tests ---

  it("creates a finding-level item with parentId", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "compliance" });
    mockDb.remediationItem.create.mockResolvedValue({ id: "child-1", parentId: "parent-1", itemType: "finding" });
    mockDb.remediationItem.findMany.mockResolvedValue([]);
    mockDb.remediationItem.update.mockResolvedValue({});

    const result = await service.create("org-1", {
      title: "Fix CVE-2024-1234",
      description: "Upgrade jsonwebtoken",
      itemType: "finding",
      findingId: "f-1",
      parentId: "parent-1",
      createdBy: "user-1",
    });
    expect(result).toHaveProperty("parentId", "parent-1");
  });

  it("rejects parent from different org", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-other", itemType: "compliance" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("not found");
  });

  it("rejects finding-type item as parent", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "finding" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("compliance-type");
  });

  it("rejects depth > 2 (child of a child)", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "parent-1", orgId: "org-1", itemType: "compliance", parentId: "grandparent-1" });

    await expect(service.create("org-1", {
      title: "Test", description: "Test", itemType: "finding", parentId: "parent-1", createdBy: "user-1",
    })).rejects.toThrow("depth");
  });

  // --- getById ---

  it("returns item with children", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", children: [{ id: "child-1" }],
    });

    const result = await service.getById("org-1", "rem-1");
    expect(result).toHaveProperty("children");
    expect(result!.children).toHaveLength(1);
  });

  it("returns null for wrong org on getById", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-other" });

    const result = await service.getById("org-1", "rem-1");
    expect(result).toBeNull();
  });

  // --- getStats ---

  it("returns stats with correct shape", async () => {
    mockDb.remediationItem.count
      .mockResolvedValueOnce(5)   // open
      .mockResolvedValueOnce(3)   // inProgress
      .mockResolvedValueOnce(2)   // overdue
      .mockResolvedValueOnce(10)  // completed
      .mockResolvedValueOnce(1);  // acceptedRisk
    mockDb.remediationItem.findMany.mockResolvedValue([]);

    const result = await service.getStats("org-1");
    expect(result).toEqual({
      open: 5,
      inProgress: 3,
      overdue: 2,
      completed: 10,
      acceptedRisk: 1,
      avgResolutionDays: 0,
      slaCompliance: 100,
    });
  });

  // --- Parent roll-up on child update ---

  it("recomputes parent score when child status changes", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "child-1", orgId: "org-1", status: "open", parentId: "parent-1",
    });
    mockDb.remediationItem.update.mockResolvedValue({ id: "child-1", status: "assigned" });
    mockDb.remediationItem.findMany.mockResolvedValue([
      { id: "child-1", status: "assigned", priority: "high", dueDate: null, linkedFindingIds: [], findingId: null, priorityScore: 30 },
    ]);

    await service.update("org-1", "child-1", { status: "assigned" });

    // Parent should be updated with max child score
    expect(mockDb.remediationItem.update).toHaveBeenCalledTimes(2); // child + parent
  });

  // --- linkExternal ---

  it("stores externalRef on link-external", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", externalRef: null });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", externalRef: "jira:PROJ-123" });

    const result = await service.linkExternal("org-1", "rem-1", "jira:PROJ-123");
    expect(result.externalRef).toBe("jira:PROJ-123");
  });

  it("rejects linking already-linked item", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", externalRef: "jira:PROJ-100" });

    await expect(service.linkExternal("org-1", "rem-1", "jira:PROJ-123")).rejects.toThrow("already linked");
  });

  // --- Workflow FSM tests ---

  it("validates status transitions against workflow FSM", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue(null);

    // open -> in_review should fail (must go through assigned, in_progress first)
    await expect(service.update("org-1", "rem-1", { status: "in_review" })).rejects.toThrow();
  });

  it("respects org skip stages", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue({ skipStages: ["assigned"] });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });

    const result = await service.update("org-1", "rem-1", { status: "in_progress" });
    expect(result.status).toBe("in_progress");
  });

  it("allows accepted_risk from any non-terminal state", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "in_review", parentId: null,
    });
    mockDb.workflowConfig.findUnique.mockResolvedValue(null);
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "accepted_risk" });

    const result = await service.update("org-1", "rem-1", { status: "accepted_risk" });
    expect(result.status).toBe("accepted_risk");
  });
});
