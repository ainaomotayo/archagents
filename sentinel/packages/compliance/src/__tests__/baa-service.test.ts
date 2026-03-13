import { describe, it, expect, vi, beforeEach } from "vitest";
import { BAARegistryService } from "../baa/service.js";

const mockDb = {
  businessAssociateAgreement: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
};

describe("BAARegistryService", () => {
  let service: BAARegistryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BAARegistryService(mockDb as any);
  });

  it("registers a new BAA", async () => {
    mockDb.businessAssociateAgreement.create.mockResolvedValue({
      id: "baa-1", vendorName: "Cloud Provider", status: "active",
    });

    const result = await service.register("org-1", {
      vendorName: "Cloud Provider",
      vendorContact: "vendor@example.com",
      agreementDate: new Date("2026-01-01"),
      expiresAt: new Date("2027-01-01"),
      documentUrl: "https://example.com/baa.pdf",
      coveredServices: ["hosting", "storage"],
      reviewedBy: "admin-1",
    });

    expect(result).toHaveProperty("id", "baa-1");
    expect(mockDb.businessAssociateAgreement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: "org-1", status: "active" }),
      }),
    );
  });

  it("updates a BAA", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({
      id: "baa-1", orgId: "org-1", status: "active",
    });
    mockDb.businessAssociateAgreement.update.mockResolvedValue({
      id: "baa-1", vendorContact: "new@example.com",
    });

    const result = await service.update("org-1", "baa-1", { vendorContact: "new@example.com" });
    expect(result).toHaveProperty("vendorContact", "new@example.com");
  });

  it("terminates a BAA", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({
      id: "baa-1", orgId: "org-1", status: "active",
    });
    mockDb.businessAssociateAgreement.update.mockResolvedValue({
      id: "baa-1", status: "terminated",
    });

    const result = await service.terminate("org-1", "baa-1");
    expect(result.status).toBe("terminated");
  });

  it("rejects terminate for wrong org", async () => {
    mockDb.businessAssociateAgreement.findUnique.mockResolvedValue({
      id: "baa-1", orgId: "org-other", status: "active",
    });

    await expect(service.terminate("org-1", "baa-1")).rejects.toThrow("not found");
  });

  it("lists active BAAs", async () => {
    mockDb.businessAssociateAgreement.findMany.mockResolvedValue([
      { id: "baa-1", status: "active" },
    ]);

    const result = await service.list("org-1");
    expect(result).toHaveLength(1);
  });

  it("gets expiring BAAs within N days", async () => {
    mockDb.businessAssociateAgreement.findMany.mockResolvedValue([
      { id: "baa-1", expiresAt: new Date(Date.now() + 86400000 * 15) },
    ]);

    const result = await service.getExpiring("org-1", 30);
    expect(result).toHaveLength(1);
  });
});
