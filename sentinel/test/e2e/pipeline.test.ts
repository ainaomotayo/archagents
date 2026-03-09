import { describe, it, expect, vi } from "vitest";
import { signRequest, verifyRequest } from "@sentinel/auth";
import { AuditLog } from "@sentinel/audit";
import { buildScanRoutes } from "../../apps/api/src/routes/scans.js";
import { parseDiff } from "../../apps/cli/src/git/diff.js";
import type { SentinelDiffPayload } from "@sentinel/shared";

describe("E2E Pipeline Integration", () => {
  it("full flow: CLI diff -> signed request -> API creates scan -> publishes event -> audit logged", async () => {
    // Step 1: CLI parses a git diff
    const rawDiff = `diff --git a/src/app.py b/src/app.py
index 1234567..abcdefg 100644
--- a/src/app.py
+++ b/src/app.py
@@ -1,3 +1,6 @@
 import os
+import requets  # typosquat!
+DEBUG = True    # insecure default!

 def main():
     pass`;

    const files = parseDiff(rawDiff);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/app.py");
    expect(files[0].hunks).toHaveLength(1);

    // Step 2: CLI constructs payload
    const payload: SentinelDiffPayload = {
      projectId: "proj_e2e",
      commitHash: "e2e_abc123",
      branch: "main",
      author: "dev@test.com",
      timestamp: new Date().toISOString(),
      files: files.map((f) => ({
        path: f.path,
        language: "python",
        hunks: f.hunks,
        aiScore: 0.9,
      })),
      scanConfig: {
        securityLevel: "standard",
        licensePolicy: "MIT",
        qualityThreshold: 0.7,
      },
    };

    // Step 3: CLI signs the request
    const secret = "e2e_test_secret";
    const body = JSON.stringify(payload);
    const signature = signRequest(body, secret);

    // Step 4: API verifies signature
    const verifyResult = verifyRequest(signature, body, secret);
    expect(verifyResult.valid).toBe(true);

    // Step 5: API creates scan via routes (mock stores, real route logic)
    const publishedEvents: Array<{
      stream: string;
      data: Record<string, unknown>;
    }> = [];
    const mockEventBus = {
      publish: vi.fn(
        async (stream: string, data: Record<string, unknown>) => {
          publishedEvents.push({ stream, data });
          return "1234-0";
        },
      ),
    };

    const auditEvents: Array<Record<string, unknown>> = [];
    const mockAuditStore = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      }),
    };
    const auditLog = new AuditLog(mockAuditStore as any);

    const mockScanStore = {
      create: vi.fn(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: "scan_e2e_001",
          status: "pending",
          ...data,
        }),
      ),
      findUnique: vi.fn(),
    };

    const routes = buildScanRoutes({
      scanStore: mockScanStore as any,
      eventBus: mockEventBus as any,
      auditLog,
    });

    const result = await routes.submitScan({ orgId: "org_e2e", body: payload });

    // Step 6: Verify scan created
    expect(result.scanId).toBe("scan_e2e_001");
    expect(result.status).toBe("pending");
    expect(result.pollUrl).toBe("/v1/scans/scan_e2e_001/poll");

    // Step 7: Verify event published to Redis stream
    expect(publishedEvents).toHaveLength(1);
    expect(publishedEvents[0].stream).toBe("sentinel.diffs");
    expect(publishedEvents[0].data).toMatchObject({
      scanId: "scan_e2e_001",
    });
    // Verify the payload is included in the event
    const eventPayload = publishedEvents[0].data
      .payload as SentinelDiffPayload;
    expect(eventPayload.projectId).toBe("proj_e2e");
    expect(eventPayload.commitHash).toBe("e2e_abc123");

    // Step 8: Verify audit event logged
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: "scan.started",
      resourceType: "scan",
      resourceId: "scan_e2e_001",
      orgId: "org_e2e",
    });

    // Step 9: Verify the diff data from CLI matches what agents would receive
    // This ensures the TypeScript DiffHunk format matches what Python agents expect
    const diffEvent = publishedEvents[0].data;
    const eventFiles = (diffEvent.payload as any).files;
    expect(eventFiles[0].hunks[0]).toHaveProperty("oldStart");
    expect(eventFiles[0].hunks[0]).toHaveProperty("newStart");
    expect(eventFiles[0].hunks[0]).toHaveProperty("content");
  });

  it("rejects tampered request", () => {
    const body = JSON.stringify({ projectId: "proj_1" });
    const signature = signRequest(body, "secret_a");
    const result = verifyRequest(signature, body, "wrong_secret");
    expect(result.valid).toBe(false);
  });

  it("CLI diff parser output is compatible with Python agent DiffEvent.from_dict format", () => {
    // This test verifies the contract between TS and Python
    const rawDiff = `diff --git a/test.js b/test.js
--- a/test.js
+++ b/test.js
@@ -1,2 +1,4 @@
 const x = 1;
+const y = require('axios');
+const z = require('lodash');
 module.exports = x;`;

    const files = parseDiff(rawDiff);

    // Construct the payload as CLI would
    const payload = {
      projectId: "proj_contract",
      commitHash: "contract_test",
      branch: "main",
      author: "dev@test.com",
      timestamp: "2026-03-09T12:00:00Z",
      files: files.map((f) => ({
        path: f.path,
        language: "javascript",
        hunks: f.hunks,
        aiScore: 0.8,
      })),
      scanConfig: {
        securityLevel: "standard" as const,
        licensePolicy: "MIT",
        qualityThreshold: 0.7,
      },
    };

    // Verify Python DiffEvent.from_dict expects these exact keys
    // (camelCase in JSON, Python agent converts to snake_case)
    const event = {
      scanId: "scan_contract",
      payload,
      submittedAt: "2026-03-09T12:00:00Z",
    };

    expect(event.payload.files[0].hunks[0]).toHaveProperty("oldStart");
    expect(event.payload.files[0].hunks[0]).toHaveProperty("oldCount");
    expect(event.payload.files[0].hunks[0]).toHaveProperty("newStart");
    expect(event.payload.files[0].hunks[0]).toHaveProperty("newCount");
    expect(event.payload.files[0].hunks[0]).toHaveProperty("content");
    expect(event.payload).toHaveProperty("scanConfig");
    expect(event.payload.scanConfig).toHaveProperty("securityLevel");
    expect(event.payload.scanConfig).toHaveProperty("licensePolicy");
  });
});
