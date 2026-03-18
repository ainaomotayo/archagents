import { describe, it, expect, vi } from "vitest";
import { SFTPAdapter } from "./sftp.js";
import type { ArchivePayload, ArchiveConfig } from "../ports/archive-port.js";

vi.mock("ssh2-sftp-client", () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ isDirectory: true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { default: vi.fn().mockImplementation(() => mockClient) };
});

const adapter = new SFTPAdapter();
const config: ArchiveConfig = {
  type: "sftp",
  config: { host: "sftp.example.com", port: 22, remotePath: "/archives" },
  credential: { username: "user", password: "pass" },
};
const payload: ArchivePayload = {
  orgId: "org-1", executionId: "exec-1", dataType: "findings",
  records: [{ id: "f1" }],
  metadata: { severity: "high", cutoffDate: "2026-01-01", exportedAt: "2026-03-18" },
};

describe("SFTPAdapter", () => {
  it("has type 'sftp'", () => { expect(adapter.type).toBe("sftp"); });

  it("testConnection connects and stats remote path", async () => {
    const result = await adapter.testConnection(config);
    expect(result.ok).toBe(true);
  });

  it("archives records as JSONL", async () => {
    const result = await adapter.archive(payload, config);
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.destination).toContain("/archives/org-1/findings/");
  });
});
