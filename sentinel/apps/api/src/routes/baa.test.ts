import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  businessAssociateAgreement: {
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

import { buildBAARoutes } from "./baa.js";

describe("buildBAARoutes", () => {
  let routes: ReturnType<typeof buildBAARoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildBAARoutes({ db: mockDb as any });
  });

  it("registers a BAA", async () => {
    mockDb.businessAssociateAgreement.create.mockResolvedValue({ id: "baa-1", status: "active" });
    const result = await routes.register("org-1", {
      vendorName: "Cloud Provider",
      vendorContact: "vendor@example.com",
      agreementDate: new Date(),
      expiresAt: new Date(Date.now() + 365 * 86400000),
      coveredServices: ["hosting", "backup"],
      reviewedBy: "admin-1",
    });
    expect(result).toHaveProperty("id", "baa-1");
    expect(result).toHaveProperty("status", "active");
  });

  it("lists BAAs", async () => {
    mockDb.businessAssociateAgreement.findMany.mockResolvedValue([
      { id: "baa-1", vendorName: "Cloud Provider" },
      { id: "baa-2", vendorName: "SaaS Vendor" },
    ]);
    const result = await routes.list("org-1");
    expect(result).toHaveLength(2);
  });

  it("updates a BAA", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({ id: "baa-1", orgId: "org-1", status: "active" });
    mockDb.businessAssociateAgreement.update.mockResolvedValue({ id: "baa-1", vendorContact: "new@example.com" });
    const result = await routes.update("org-1", "baa-1", { vendorContact: "new@example.com" });
    expect(result).toHaveProperty("vendorContact", "new@example.com");
  });

  it("rejects update for non-existent BAA", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue(null);
    await expect(routes.update("org-1", "baa-1", { vendorContact: "x" })).rejects.toThrow("BAA not found");
  });

  it("terminates a BAA", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({ id: "baa-1", orgId: "org-1", status: "active" });
    mockDb.businessAssociateAgreement.update.mockResolvedValue({ id: "baa-1", status: "terminated" });
    const result = await routes.terminate("org-1", "baa-1");
    expect(result.status).toBe("terminated");
  });

  it("rejects terminate for wrong org", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({ id: "baa-1", orgId: "org-other", status: "active" });
    await expect(routes.terminate("org-1", "baa-1")).rejects.toThrow("BAA not found");
  });

  it("gets expiring BAAs", async () => {
    mockDb.businessAssociateAgreement.findMany.mockResolvedValue([
      { id: "baa-1", vendorName: "Expiring Vendor", expiresAt: new Date(Date.now() + 15 * 86400000) },
    ]);
    const result = await routes.getExpiring("org-1", 30);
    expect(result).toHaveLength(1);
    expect(mockDb.businessAssociateAgreement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: "org-1", status: "active" }) }),
    );
  });
});
