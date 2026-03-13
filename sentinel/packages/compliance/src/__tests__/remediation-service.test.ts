import { describe, it, expect, vi, beforeEach } from "vitest";
import { RemediationService } from "../remediation/service.js";

const mockDb = {
  remediationItem: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
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

  it("updates status from open to in_progress", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "open",
    });
    mockDb.remediationItem.update.mockResolvedValue({
      id: "rem-1", status: "in_progress",
    });

    const result = await service.update("org-1", "rem-1", { status: "in_progress" });
    expect(result.status).toBe("in_progress");
  });

  it("updates status to completed with completedBy", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({
      id: "rem-1", orgId: "org-1", status: "in_progress",
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
});
