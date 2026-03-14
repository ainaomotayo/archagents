import { describe, it, expect, vi, beforeEach } from "vitest";
import { IPAttributionService } from "../ip-attribution/service.js";

// Minimal mock DB
function createMockDb() {
  const store: any = {
    scans: new Map(),
    findings: [],
    certs: new Map(),
    fileAttrs: [],
    evidence: [],
  };

  return {
    _store: store,
    scan: {
      findUnique: vi.fn(async ({ where }: any) => store.scans.get(where.id) ?? null),
    },
    finding: {
      findMany: vi.fn(async ({ where }: any) =>
        store.findings.filter((f: any) => f.scanId === where.scanId),
      ),
    },
    iPAttributionCertificate: {
      create: vi.fn(async ({ data }: any) => {
        const cert = { id: `cert-${Date.now()}`, ...data };
        store.certs.set(data.scanId, cert);
        return cert;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.scanId) {
          return store.certs.get(where.scanId) ?? null;
        }
        return null;
      }),
      findMany: vi.fn(async () => [...store.certs.values()]),
    },
    fileAttribution: {
      create: vi.fn(async ({ data }: any) => {
        const fa = { id: `fa-${store.fileAttrs.length}`, ...data };
        store.fileAttrs.push(fa);
        return fa;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        store.fileAttrs.filter((fa: any) => {
          if (where?.certificateId) return fa.certificateId === where.certificateId;
          if (where?.file) return fa.file === where.file;
          return true;
        }),
      ),
      findFirst: vi.fn(async ({ where, include }: any) => {
        const fa = store.fileAttrs.find(
          (f: any) => f.certificateId === where.certificateId && f.file === where.file,
        );
        if (!fa) return null;
        if (include?.evidence) {
          return { ...fa, evidence: store.evidence.filter((e: any) => e.attributionId === fa.id) };
        }
        return fa;
      }),
    },
    attributionEvidence: {
      createMany: vi.fn(async ({ data }: any) => {
        for (const d of data) {
          store.evidence.push({ id: `ev-${store.evidence.length}`, ...d });
        }
        return { count: data.length };
      }),
    },
  };
}

function seedScan(db: any, scanId: string) {
  db._store.scans.set(scanId, {
    id: scanId,
    projectId: "proj-1",
    orgId: "org-1",
    commitHash: "abc123",
    branch: "main",
    author: "dev",
    metadata: {},
  });
}

function seedFinding(db: any, scanId: string, file: string, agentName: string, overrides: any = {}) {
  db._store.findings.push({
    id: `finding-${db._store.findings.length}`,
    scanId,
    file,
    agentName,
    rawData: overrides.rawData ?? {},
    decisionTrace: overrides.decisionTrace ?? null,
  });
}

describe("IPAttributionService", () => {
  let db: ReturnType<typeof createMockDb>;
  let service: IPAttributionService;

  beforeEach(() => {
    db = createMockDb();
    service = new IPAttributionService(db);
  });

  it("generateForScan produces certificate for AI detector findings", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    seedFinding(db, "scan-1", "src/b.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.15, toolName: null, modelVersion: null, signals: {} },
    });

    const certId = await service.generateForScan("scan-1", "org-1", "secret");
    expect(certId).toBeTruthy();
    expect(db.iPAttributionCertificate.create).toHaveBeenCalledTimes(1);
    expect(db.fileAttribution.create).toHaveBeenCalledTimes(2);
  });

  it("generateForScan returns null for missing scan", async () => {
    const result = await service.generateForScan("missing", "org-1", "secret");
    expect(result).toBeNull();
  });

  it("generateForScan returns null when no findings", async () => {
    seedScan(db, "scan-1");
    const result = await service.generateForScan("scan-1", "org-1", "secret");
    expect(result).toBeNull();
  });

  it("getByScanId returns document", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    await service.generateForScan("scan-1", "org-1", "secret");

    const doc = await service.getByScanId("scan-1");
    expect(doc).not.toBeNull();
    expect(doc!.version).toBe("1.0");
    expect(doc!.summary.totalFiles).toBe(1);
  });

  it("getAttributions returns file list", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    await service.generateForScan("scan-1", "org-1", "secret");

    const attrs = await service.getAttributions("scan-1");
    expect(attrs.length).toBeGreaterThan(0);
  });

  it("getAttributionWithEvidence returns evidence chain", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    await service.generateForScan("scan-1", "org-1", "secret");

    const result = await service.getAttributionWithEvidence("scan-1", "src/a.ts");
    expect(result).not.toBeNull();
  });

  it("getOrgToolBreakdown aggregates across scans", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    await service.generateForScan("scan-1", "org-1", "secret");

    const breakdown = await service.getOrgToolBreakdown("org-1");
    expect(breakdown.length).toBeGreaterThan(0);
  });

  it("generateForScan persists evidence rows", async () => {
    seedScan(db, "scan-1");
    seedFinding(db, "scan-1", "src/a.ts", "ai-detector", {
      decisionTrace: { overallScore: 0.85, toolName: "copilot", modelVersion: null, signals: {} },
    });
    await service.generateForScan("scan-1", "org-1", "secret");

    expect(db.attributionEvidence.createMany).toHaveBeenCalled();
  });
});
