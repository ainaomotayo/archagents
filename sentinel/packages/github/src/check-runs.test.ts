import { describe, it, expect } from "vitest";
import {
  buildCheckRunCreate,
  buildCheckRunComplete,
  buildRevocationUpdate,
} from "./check-runs.js";
import type { CheckAnnotation } from "./annotations.js";

describe("buildCheckRunCreate", () => {
  it("creates an in_progress check run", () => {
    const result = buildCheckRunCreate("scan-001", "abc123");

    expect(result.name).toBe("SENTINEL Compliance Scan");
    expect(result.head_sha).toBe("abc123");
    expect(result.status).toBe("in_progress");
    expect(result.conclusion).toBeUndefined();
    expect(result.output.title).toContain("in progress");
    expect(result.output.summary).toContain("scan-001");
  });
});

describe("buildCheckRunComplete", () => {
  const sampleAnnotations: CheckAnnotation[] = [
    {
      path: "src/auth.ts",
      start_line: 10,
      end_line: 15,
      annotation_level: "failure",
      title: "[HIGH] SQL Injection",
      message: "Unsanitized input in query",
    },
  ];

  it("maps full_pass to success conclusion", () => {
    const result = buildCheckRunComplete("scan-001", "full_pass", 5, sampleAnnotations);

    expect(result.status).toBe("completed");
    expect(result.conclusion).toBe("success");
    expect(result.output.title).toContain("FULL PASS");
    expect(result.output.title).toContain("5/100");
    expect(result.output.summary).toContain("scan-001");
    expect(result.output.annotations).toHaveLength(1);
  });

  it("maps provisional_pass to neutral conclusion", () => {
    const result = buildCheckRunComplete("scan-002", "provisional_pass", 35, []);

    expect(result.conclusion).toBe("neutral");
    expect(result.output.title).toContain("PROVISIONAL PASS");
    expect(result.output.annotations).toBeUndefined();
  });

  it("maps fail to failure conclusion", () => {
    const result = buildCheckRunComplete("scan-003", "fail", 85, sampleAnnotations);

    expect(result.conclusion).toBe("failure");
    expect(result.output.title).toContain("FAIL");
  });

  it("maps revoked to failure conclusion", () => {
    const result = buildCheckRunComplete("scan-004", "revoked", 90, []);

    expect(result.conclusion).toBe("failure");
  });

  it("maps partial to action_required conclusion", () => {
    const result = buildCheckRunComplete("scan-005", "partial", 50, []);

    expect(result.conclusion).toBe("action_required");
  });

  it("includes finding count in summary", () => {
    const result = buildCheckRunComplete("scan-006", "full_pass", 10, sampleAnnotations);

    expect(result.output.summary).toContain("**Findings:** 1");
  });
});

describe("buildRevocationUpdate", () => {
  it("creates a failure check run for revocation", () => {
    const result = buildRevocationUpdate("scan-007");

    expect(result.status).toBe("completed");
    expect(result.conclusion).toBe("failure");
    expect(result.output.title).toContain("Revoked");
    expect(result.output.summary).toContain("scan-007");
    expect(result.output.summary).toContain("revoked");
  });
});
