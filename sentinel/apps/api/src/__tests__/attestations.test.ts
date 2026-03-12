import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  controlAttestation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  attestationHistory: {
    create: vi.fn(),
  },
};

vi.mock("@sentinel/db", () => ({
  getDb: () => mockDb,
  withTenant: (_db: any, _orgId: string, fn: any) => fn(mockDb),
  disconnectDb: vi.fn(),
}));

import { buildAttestationRoutes } from "../routes/attestations.js";

describe("buildAttestationRoutes", () => {
  let routes: ReturnType<typeof buildAttestationRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    routes = buildAttestationRoutes({ db: mockDb as any });
  });

  it("creates an attestation", async () => {
    mockDb.controlAttestation.create.mockResolvedValue({
      id: "att-1",
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
    });
    mockDb.attestationHistory.create.mockResolvedValue({});

    const result = await routes.createAttestation("org-1", {
      frameworkSlug: "hipaa",
      controlCode: "AS-1.1",
      attestedBy: "user-1",
      attestationType: "compliant",
      justification: "Risk analysis completed and documented in full",
      evidenceUrls: [],
    });

    expect(result).toHaveProperty("id", "att-1");
  });

  it("lists attestations by framework", async () => {
    mockDb.controlAttestation.findMany.mockResolvedValue([
      { id: "att-1", controlCode: "AS-1.1" },
    ]);

    const result = await routes.listAttestations("org-1", "hipaa");
    expect(result).toHaveLength(1);
  });

  it("gets attestation by id", async () => {
    mockDb.controlAttestation.findUnique.mockResolvedValue({
      id: "att-1",
      orgId: "org-1",
    });

    const result = await routes.getAttestation("org-1", "att-1");
    expect(result).toHaveProperty("id", "att-1");
  });

  it("returns null for wrong org", async () => {
    mockDb.controlAttestation.findUnique.mockResolvedValue({
      id: "att-1",
      orgId: "org-other",
    });

    const result = await routes.getAttestation("org-1", "att-1");
    expect(result).toBeNull();
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
    mockDb.attestationHistory.create.mockResolvedValue({});

    const result = await routes.revokeAttestation(
      "org-1",
      "att-1",
      "Violation found",
      "admin-1",
    );
    expect(result).toHaveProperty("revokedAt");
  });

  it("renews an attestation", async () => {
    mockDb.controlAttestation.findUnique.mockResolvedValue({
      id: "att-1",
      orgId: "org-1",
      revokedAt: null,
      attestationType: "compliant",
      validFrom: new Date(),
      expiresAt: new Date(),
    });
    mockDb.controlAttestation.update.mockResolvedValue({
      id: "att-1",
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    });
    mockDb.attestationHistory.create.mockResolvedValue({});

    const result = await routes.renewAttestation("org-1", "att-1", "admin-1");
    expect(result).toHaveProperty("id", "att-1");
    expect(mockDb.controlAttestation.update).toHaveBeenCalled();
  });

  it("gets expiring attestations", async () => {
    mockDb.controlAttestation.findMany.mockResolvedValue([
      { id: "att-1", expiresAt: new Date() },
    ]);

    const result = await routes.getExpiringAttestations("org-1", 14);
    expect(result).toHaveLength(1);
  });
});
