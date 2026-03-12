import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  remediationItem: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@sentinel/db", () => ({
  getDb: () => mockDb,
  withTenant: (_db: any, _orgId: string, fn: any) => fn(mockDb),
  disconnectDb: vi.fn(),
}));

import { buildRemediationRoutes } from "./remediations.js";

describe("buildRemediationRoutes", () => {
  let routes: ReturnType<typeof buildRemediationRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildRemediationRoutes({ db: mockDb as any });
  });

  it("creates a remediation item", async () => {
    mockDb.remediationItem.create.mockResolvedValue({ id: "rem-1", status: "open" });
    const result = await routes.create("org-1", {
      frameworkSlug: "hipaa",
      controlCode: "TS-1.4",
      title: "Fix encryption",
      description: "Need encryption at rest",
      createdBy: "user-1",
    });
    expect(result).toHaveProperty("id", "rem-1");
    expect(result).toHaveProperty("status", "open");
  });

  it("lists remediations with filters", async () => {
    mockDb.remediationItem.findMany.mockResolvedValue([{ id: "rem-1" }, { id: "rem-2" }]);
    const result = await routes.list("org-1", { frameworkSlug: "hipaa" });
    expect(result).toHaveLength(2);
    expect(mockDb.remediationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org-1", frameworkSlug: "hipaa" }) }),
    );
  });

  it("lists remediations without filters", async () => {
    mockDb.remediationItem.findMany.mockResolvedValue([{ id: "rem-1" }]);
    const result = await routes.list("org-1", {});
    expect(result).toHaveLength(1);
  });

  it("updates a remediation", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });
    const result = await routes.update("org-1", "rem-1", { status: "in_progress" });
    expect(result.status).toBe("in_progress");
  });

  it("rejects update for non-existent remediation", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue(null);
    await expect(routes.update("org-1", "rem-1", { status: "in_progress" })).rejects.toThrow("not found");
  });

  it("rejects invalid status transition", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "completed" });
    await expect(routes.update("org-1", "rem-1", { status: "open" })).rejects.toThrow("Invalid status transition");
  });

  it("gets overdue remediations", async () => {
    mockDb.remediationItem.findMany.mockResolvedValue([{ id: "rem-1", dueDate: new Date("2025-01-01") }]);
    const result = await routes.getOverdue("org-1");
    expect(result).toHaveLength(1);
  });
});
