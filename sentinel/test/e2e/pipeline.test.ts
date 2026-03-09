import { describe, it, expect, vi } from "vitest";
import { signRequest, verifyRequest } from "@sentinel/auth";
import { AuditLog } from "@sentinel/audit";
import { Assessor, verifyCertificate } from "@sentinel/assessor";
import { buildScanRoutes } from "../../apps/api/src/routes/scans.js";
import { parseDiff } from "../../apps/cli/src/git/diff.js";
import {
  exitCodeFromStatus,
  formatSummary,
  formatSarif,
} from "../../apps/cli/src/commands/ci.js";
import type {
  SentinelDiffPayload,
  Finding,
  FindingEvent,
  AgentResult,
  ComplianceAssessment,
} from "@sentinel/shared";

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

  it("full assessment pipeline: agent findings -> assessor -> certificate -> CLI output", () => {
    const orgSecret = "e2e-org-secret-key";

    // Simulate what 6 Python agents would return (FindingEvent format)
    const findingEvents: FindingEvent[] = [
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-security",
        findings: [
          {
            type: "security",
            file: "src/api/users.py",
            lineStart: 13,
            lineEnd: 13,
            severity: "critical",
            confidence: "high",
            category: "injection",
            title: "SQL Injection",
            description: "User input interpolated directly into SQL query",
            remediation: "Use parameterized queries",
            scanner: "custom-rules",
            cweId: "CWE-89",
          } as Finding,
          {
            type: "security",
            file: "src/api/users.py",
            lineStart: 16,
            lineEnd: 16,
            severity: "critical",
            confidence: "high",
            category: "code-execution",
            title: "Dangerous eval()",
            description: "eval() called on user-controlled input",
            remediation: "Remove eval() and use safe parsing",
            scanner: "custom-rules",
            cweId: "CWE-95",
          } as Finding,
        ],
        agentResult: {
          agentName: "sentinel-security",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "sec123",
          status: "completed",
          findingCount: 2,
          durationMs: 45,
        },
      },
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-ip-license",
        findings: [],
        agentResult: {
          agentName: "sentinel-ip-license",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "lic123",
          status: "completed",
          findingCount: 0,
          durationMs: 30,
        },
      },
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-dependency",
        findings: [
          {
            type: "dependency",
            file: "package.json",
            lineStart: 8,
            lineEnd: 8,
            severity: "medium",
            confidence: "medium",
            package: "unknown-pkg-xyz",
            findingType: "typosquat",
            detail: "Package has low download count and similar name to known package",
            existingAlternative: null,
            cveId: null,
          } as Finding,
        ],
        agentResult: {
          agentName: "sentinel-dependency",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "dep123",
          status: "completed",
          findingCount: 1,
          durationMs: 22,
        },
      },
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-ai-detector",
        findings: [
          {
            type: "ai-detection",
            file: "src/utils/helpers.ts",
            lineStart: 1,
            lineEnd: 20,
            severity: "low",
            confidence: "high",
            aiProbability: 0.92,
            detectionMethod: "entropy+markers+stylometric",
            toolAttribution: "copilot",
          } as Finding,
        ],
        agentResult: {
          agentName: "sentinel-ai-detector",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "ai123",
          status: "completed",
          findingCount: 1,
          durationMs: 120,
        },
      },
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-quality",
        findings: [
          {
            type: "quality",
            file: "src/services/processor.py",
            lineStart: 1,
            lineEnd: 28,
            severity: "medium",
            confidence: "high",
            metric: "complexity",
            score: 12,
            detail: "Cyclomatic complexity 12 exceeds threshold 10",
            suggestion: "Extract nested conditions into separate functions",
          } as Finding,
        ],
        agentResult: {
          agentName: "sentinel-quality",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "qual123",
          status: "completed",
          findingCount: 1,
          durationMs: 35,
        },
      },
      {
        scanId: "scan_e2e_full",
        agentName: "sentinel-policy",
        findings: [],
        agentResult: {
          agentName: "sentinel-policy",
          agentVersion: "0.1.0",
          rulesetVersion: "rules-0.1.0",
          rulesetHash: "pol123",
          status: "completed",
          findingCount: 0,
          durationMs: 18,
        },
      },
    ];

    // Step 1: Run assessor
    const assessor = new Assessor();
    const assessment = assessor.assess({
      scanId: "scan_e2e_full",
      projectId: "proj-e2e-test",
      commitHash: "abc123def456",
      findingEvents,
      hasTimeouts: false,
      orgSecret,
    });

    // Step 2: Verify assessment structure
    expect(assessment.id).toBeDefined();
    expect(assessment.status).toBeDefined();
    expect(["full_pass", "provisional_pass", "fail", "partial"]).toContain(
      assessment.status,
    );
    expect(assessment.riskScore).toBeGreaterThanOrEqual(0);
    expect(assessment.riskScore).toBeLessThanOrEqual(100);
    expect(assessment.findings).toHaveLength(5);
    expect(assessment.agentResults).toHaveLength(6);

    // With 2 critical security findings, should fail
    expect(assessment.status).toBe("fail");
    expect(assessment.categories.security.status).toBe("fail");

    // Step 3: Verify certificate was generated and signed
    expect(assessment.certificate).toBeDefined();
    expect(assessment.certificate!.id).toMatch(/^cert-/);
    expect(assessment.certificate!.version).toBe("1.0");
    expect(assessment.certificate!.signature).toBeTruthy();
    expect(assessment.certificate!.expiresAt).toBeTruthy();

    // Verify HMAC signature is valid
    const certJson = JSON.stringify(assessment.certificate);
    expect(verifyCertificate(certJson, orgSecret)).toBe(true);
    // Tampered secret should fail
    expect(verifyCertificate(certJson, "wrong-secret")).toBe(false);

    // Step 4: Verify certificate metadata includes all agents
    expect(assessment.certificate!.scanMetadata.agents).toHaveLength(6);
    const agentNames = assessment.certificate!.scanMetadata.agents.map(
      (a) => a.name,
    );
    expect(agentNames).toContain("sentinel-security");
    expect(agentNames).toContain("sentinel-ai-detector");
    expect(agentNames).toContain("sentinel-quality");
    expect(agentNames).toContain("sentinel-dependency");

    // Step 5: Test CLI formatSummary
    const summary = formatSummary(assessment);
    expect(summary).toContain("SENTINEL Scan Report");
    expect(summary).toContain("FAIL");
    expect(summary).toContain("Risk Score:");
    expect(summary).toContain("Security:");
    expect(summary).toContain("Certificate:");

    // Step 6: Test CLI formatSarif
    const sarif = formatSarif(assessment.findings) as any;
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].results).toHaveLength(5);

    // Verify SARIF severity mapping
    const criticals = sarif.runs[0].results.filter(
      (r: any) => r.level === "error",
    );
    expect(criticals.length).toBeGreaterThanOrEqual(2); // 2 critical security findings

    // Step 7: Test CLI exit codes
    expect(exitCodeFromStatus("full_pass")).toBe(0);
    expect(exitCodeFromStatus("fail")).toBe(1);
    expect(exitCodeFromStatus("provisional_pass")).toBe(3);
    expect(exitCodeFromStatus(assessment.status)).toBe(1); // fail -> 1

    // Step 8: Test re-evaluation (LLM agent adds findings later)
    const llmFindings: Finding[] = [
      {
        type: "security",
        file: "src/api/users.py",
        lineStart: 8,
        lineEnd: 8,
        severity: "high",
        confidence: "medium",
        category: "hardcoded-secret",
        title: "Hardcoded API Key",
        description: "API key embedded in source code",
        remediation: "Use environment variables",
        scanner: "llm-review",
        cweId: "CWE-798",
      } as Finding,
    ];

    const reAssessment = assessor.reEvaluate(
      assessment,
      llmFindings,
      orgSecret,
    );
    expect(reAssessment.findings).toHaveLength(6); // 5 + 1
    expect(reAssessment.status).toBe("fail"); // still fail
    expect(reAssessment.riskScore).toBeGreaterThanOrEqual(
      assessment.riskScore,
    ); // risk can only stay or increase
    expect(reAssessment.certificate).toBeDefined();
    expect(
      verifyCertificate(
        JSON.stringify(reAssessment.certificate),
        orgSecret,
      ),
    ).toBe(true);

    // Step 9: Test persistence interface
    const savedAssessments: any[] = [];
    const savedCertificates: any[] = [];
    const mockStore = {
      saveAssessment: vi.fn(async (a: any) => {
        savedAssessments.push(a);
      }),
      saveCertificate: vi.fn(async (c: any) => {
        savedCertificates.push(c);
      }),
    };

    return assessor
      .persist(mockStore, assessment, "scan_e2e_full", "org_e2e")
      .then(() => {
        expect(savedAssessments).toHaveLength(1);
        expect(savedAssessments[0].scanId).toBe("scan_e2e_full");
        expect(savedAssessments[0].status).toBe("fail");
        expect(savedCertificates).toHaveLength(1);
        expect(savedCertificates[0].scanId).toBe("scan_e2e_full");
        expect(savedCertificates[0].signature).toBeTruthy();
      });
  });
});
