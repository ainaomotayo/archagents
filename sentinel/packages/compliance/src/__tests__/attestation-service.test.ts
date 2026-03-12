import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttestationService } from "../attestation/service.js";

const mockDb = {
  controlAttestation: {
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  attestationHistory: {
    create: vi.fn(),
  },
};

describe("AttestationService", () => {
  let service: AttestationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AttestationService(mockDb as any);
  });

  it("creates an attestation with history entry", async () => {
    mockDb.controlAttestation.create.mockResolvedValue({
      id: "att-1",
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
      attestationType: "compliant",
    });

    const result = await service.create("org-1", {
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
      attestedBy: "user-1",
      attestationType: "compliant",
      justification: "Risk analysis completed and documented",
      evidenceUrls: ["https://example.com/evidence"],
    });

    expect(result).toHaveProperty("id", "att-1");
    expect(mockDb.controlAttestation.create).toHaveBeenCalled();
    expect(mockDb.attestationHistory.create).toHaveBeenCalled();
  });

  it("rejects justification under 20 chars", async () => {
    await expect(
      service.create("org-1", {
        frameworkSlug: "hipaa",
        controlCode: "AS-1.1",
        attestedBy: "user-1",
        attestationType: "compliant",
        justification: "short",
        evidenceUrls: [],
      }),
    ).rejects.toThrow("at least 20");
  });

  it("rejects invalid attestation type", async () => {
    await expect(
      service.create("org-1", {
        frameworkSlug: "hipaa",
        controlCode: "AS-1.1",
        attestedBy: "user-1",
        attestationType: "invalid" as any,
        justification: "This is a valid length justification text",
        evidenceUrls: [],
      }),
    ).rejects.toThrow("Invalid attestation type");
  });

  it("renews an attestation", async () => {
    mockDb.controlAttestation.findUnique.mockResolvedValue({
      id: "att-1",
      orgId: "org-1",
      attestationType: "compliant",
      revokedAt: null,
    });
    mockDb.controlAttestation.update.mockResolvedValue({
      id: "att-1",
      expiresAt: new Date(),
    });

    const result = await service.renew("org-1", "att-1", "user-1");
    expect(result).toHaveProperty("id", "att-1");
    expect(mockDb.controlAttestation.update).toHaveBeenCalled();
    expect(mockDb.attestationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "renewed" }),
      }),
    );
  });

  it("revokes an attestation", async () => {
    mockDb.controlAttestation.findUnique.mockResolvedValue({
      id: "att-1",
      orgId: "org-1",
      revokedAt: null,
    });
    mockDb.controlAttestation.update.mockResolvedValue({
      id: "att-1",
      revokedAt: new Date(),
    });

    const result = await service.revoke("org-1", "att-1", "Compliance violation found", "admin-1");
    expect(result).toHaveProperty("revokedAt");
    expect(mockDb.attestationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "revoked" }),
      }),
    );
  });

  it("rejects create when active attestation exists", async () => {
    mockDb.controlAttestation.findFirst.mockResolvedValue({
      id: "att-existing",
      expiresAt: new Date(Date.now() + 86_400_000), // expires tomorrow
    });

    await expect(
      service.create("org-1", {
        frameworkSlug: "hipaa",
        controlCode: "AS-1.1",
        attestedBy: "user-1",
        attestationType: "compliant",
        justification: "Risk analysis completed and documented",
        evidenceUrls: [],
      }),
    ).rejects.toThrow("Active attestation already exists");
  });

  it("supersedes expired attestation on create", async () => {
    mockDb.controlAttestation.findFirst.mockResolvedValue({
      id: "att-expired",
      expiresAt: new Date(Date.now() - 86_400_000), // expired yesterday
    });
    mockDb.controlAttestation.create.mockResolvedValue({
      id: "att-new",
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
    });

    const result = await service.create("org-1", {
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
      attestedBy: "user-1",
      attestationType: "compliant",
      justification: "Risk analysis completed and documented",
      evidenceUrls: [],
    });

    expect(result).toHaveProperty("id", "att-new");
    expect(mockDb.controlAttestation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-expired" },
        data: expect.objectContaining({ revokedReason: "Superseded by new attestation" }),
      }),
    );
  });

  it("getActive returns non-expired, non-revoked attestations", async () => {
    mockDb.controlAttestation.findMany.mockResolvedValue([
      { id: "att-1", controlCode: "AS-1.1" },
    ]);

    const result = await service.getActive("org-1", "hipaa");
    expect(result).toHaveLength(1);
    expect(mockDb.controlAttestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1",
          frameworkSlug: "hipaa",
          revokedAt: null,
        }),
      }),
    );
  });

  it("getExpiring returns attestations expiring within N days", async () => {
    mockDb.controlAttestation.findMany.mockResolvedValue([
      { id: "att-1", controlCode: "TS-1.1", expiresAt: new Date() },
    ]);

    const result = await service.getExpiring("org-1", 14);
    expect(result).toHaveLength(1);
  });
});
