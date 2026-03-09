import { describe, it, expect, vi } from "vitest";
import { buildScanRoutes } from "./scans.js";
import type { ScanStore } from "./scans.js";
import type { SentinelDiffPayload } from "@sentinel/shared";

function makeDeps() {
  const scanStore: ScanStore = {
    create: vi.fn().mockResolvedValue({ id: "scan-1", status: "pending" }),
    findUnique: vi.fn().mockResolvedValue({ id: "scan-1", status: "pending" }),
  };
  const eventBus = { publish: vi.fn().mockResolvedValue("stream-id") };
  const auditLog = { append: vi.fn().mockResolvedValue({}) };

  return { scanStore, eventBus, auditLog } as unknown as Parameters<typeof buildScanRoutes>[0];
}

const samplePayload: SentinelDiffPayload = {
  projectId: "proj-1",
  commitHash: "abc123",
  branch: "main",
  author: "dev@example.com",
  timestamp: "2026-03-09T00:00:00Z",
  files: [],
  scanConfig: { securityLevel: "standard", licensePolicy: "default", qualityThreshold: 70 },
};

describe("buildScanRoutes", () => {
  it("submitScan creates record, publishes event, logs audit", async () => {
    const deps = makeDeps();
    const { submitScan } = buildScanRoutes(deps);

    const result = await submitScan({ orgId: "org-1", body: samplePayload });

    // Verify scan was created with correct data
    expect(deps.scanStore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: "proj-1",
        orgId: "org-1",
        commitHash: "abc123",
        branch: "main",
        author: "dev@example.com",
        status: "pending",
        scanLevel: "standard",
      }),
    });

    // Verify event was published
    expect(deps.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.diffs",
      expect.objectContaining({
        scanId: "scan-1",
        payload: samplePayload,
      }),
    );

    // Verify audit log was appended
    expect(deps.auditLog.append).toHaveBeenCalledWith("org-1", {
      actor: { type: "api", id: "cli", name: "SENTINEL CLI" },
      action: "scan.started",
      resource: { type: "scan", id: "scan-1" },
      detail: { commitHash: "abc123", branch: "main" },
    });

    // Verify return value
    expect(result).toEqual({
      scanId: "scan-1",
      status: "pending",
      pollUrl: "/v1/scans/scan-1/poll",
    });
  });

  it("getScan returns scan record", async () => {
    const deps = makeDeps();
    const { getScan } = buildScanRoutes(deps);

    const result = await getScan("scan-1");

    expect(deps.scanStore.findUnique).toHaveBeenCalledWith({
      where: { id: "scan-1" },
    });
    expect(result).toEqual({ id: "scan-1", status: "pending" });
  });
});
