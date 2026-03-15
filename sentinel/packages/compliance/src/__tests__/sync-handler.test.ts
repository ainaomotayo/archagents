import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncHandler } from "../remediation/sync-handler.js";

describe("SyncHandler", () => {
  let handler: SyncHandler;
  let mockDb: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockDb = {
      remediationItem: { findFirst: vi.fn(), update: vi.fn() },
    };
    mockEventBus = { publish: vi.fn() };
    handler = new SyncHandler(mockDb, mockEventBus);
  });

  it("ignores updates with [Sentinel] prefix (echo prevention)", async () => {
    const result = await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "[Sentinel] Fix CVE", status: { name: "Done" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("echo_prevention");
  });

  it("maps Jira status to Sentinel status", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "jira:PROJ-123" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "completed" });

    const result = await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "Fix something", status: { name: "Done" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(result.skipped).toBe(false);
    expect(mockDb.remediationItem.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "completed" }),
    }));
  });

  it("maps GitHub issue close to completed", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "github:org/repo#42" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "completed" });

    const result = await handler.handleGitHubWebhook({
      action: "closed",
      issue: { number: 42, state: "closed" },
      repository: { full_name: "org/repo" },
    }, "org-1");

    expect(result.skipped).toBe(false);
    expect(mockDb.remediationItem.update).toHaveBeenCalled();
  });

  it("skips if no matching remediation item found", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue(null);

    const result = await handler.handleJiraWebhook({
      issue: { key: "PROJ-999", fields: { summary: "Unknown", status: { name: "In Progress" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(result.skipped).toBe(true);
    expect(mockDb.remediationItem.update).not.toHaveBeenCalled();
  });

  it("publishes remediation.synced event", async () => {
    mockDb.remediationItem.findFirst.mockResolvedValue({ id: "rem-1", orgId: "org-1", status: "open", externalRef: "jira:PROJ-123" });
    mockDb.remediationItem.update.mockResolvedValue({ id: "rem-1", status: "in_progress" });

    await handler.handleJiraWebhook({
      issue: { key: "PROJ-123", fields: { summary: "Fix it", status: { name: "In Progress" } } },
      webhookEvent: "jira:issue_updated",
    }, "org-1");

    expect(mockEventBus.publish).toHaveBeenCalledWith("sentinel.notifications", expect.objectContaining({ topic: "remediation.synced" }));
  });
});
