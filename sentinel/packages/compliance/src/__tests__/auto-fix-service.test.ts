import { describe, it, expect, vi, beforeEach } from "vitest";
import { AutoFixService } from "../remediation/auto-fix-service.js";

describe("AutoFixService", () => {
  let service: AutoFixService;
  let mockDb: any;
  let mockGitHub: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockDb = {
      remediationItem: { findUnique: vi.fn(), update: vi.fn() },
      finding: { findUnique: vi.fn() },
    };
    mockGitHub = {
      createBranch: vi.fn().mockResolvedValue("fix/cve-2024-1234"),
      commitFile: vi.fn().mockResolvedValue("abc123"),
      createPullRequest: vi.fn().mockResolvedValue({ html_url: "https://github.com/org/repo/pull/42", number: 42 }),
    };
    mockEventBus = { publish: vi.fn() };
    service = new AutoFixService(mockDb, mockGitHub, mockEventBus);
  });

  it("rejects item without linked finding", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: null });
    await expect(service.triggerAutoFix("org-1", "rem-1", "user-1")).rejects.toThrow("No linked finding");
  });

  it("rejects finding without fix strategy", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1" });
    mockDb.finding.findUnique.mockResolvedValue({ id: "f-1", type: "custom", metadata: {} });
    await expect(service.triggerAutoFix("org-1", "rem-1", "user-1")).rejects.toThrow("No auto-fix strategy");
  });

  it("creates a PR for dependency vulnerability fix", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1", title: "CVE-2024-1234" });
    mockDb.finding.findUnique.mockResolvedValue({
      id: "f-1", type: "dependency", metadata: { packageName: "jsonwebtoken", fixedVersion: "9.0.3", manifestPath: "package.json", repo: "org/repo" },
    });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", externalRef: "github:org/repo#42" });

    const result = await service.triggerAutoFix("org-1", "rem-1", "user-1");
    expect(result).toHaveProperty("prUrl");
    expect(mockGitHub.createPullRequest).toHaveBeenCalled();
  });

  it("publishes remediation.auto_fix event", async () => {
    mockDb.remediationItem.findUnique.mockResolvedValue({ id: "rem-1", orgId: "org-1", findingId: "f-1", title: "CVE-2024-1234" });
    mockDb.finding.findUnique.mockResolvedValue({
      id: "f-1", type: "dependency", metadata: { packageName: "jsonwebtoken", fixedVersion: "9.0.3", manifestPath: "package.json", repo: "org/repo" },
    });
    mockDb.remediationItem.update.mockResolvedValue({});

    await service.triggerAutoFix("org-1", "rem-1", "user-1");
    expect(mockEventBus.publish).toHaveBeenCalledWith("sentinel.notifications", expect.objectContaining({ topic: "remediation.auto_fix" }));
  });
});
