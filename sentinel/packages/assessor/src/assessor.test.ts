import { describe, it, expect } from "vitest";
import { Assessor } from "./assessor.js";
import type { Finding, FindingEvent, SecurityFinding } from "@sentinel/shared";

function makeSecurityFinding(
  severity: Finding["severity"] = "medium",
): SecurityFinding {
  return {
    type: "security",
    file: "src/app.ts",
    lineStart: 10,
    lineEnd: 15,
    severity,
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "Unsanitised input",
    remediation: "Use parameterised queries",
    scanner: "semgrep",
    cweId: "CWE-89",
  };
}

function makeFindingEvent(
  agentName: string,
  findings: Finding[],
  status: "completed" | "error" | "timeout" = "completed",
): FindingEvent {
  return {
    scanId: "scan-001",
    agentName,
    findings,
    agentResult: {
      agentName,
      agentVersion: "1.0.0",
      rulesetVersion: "1.0.0",
      rulesetHash: "hash-" + agentName,
      status,
      findingCount: findings.length,
      durationMs: 200,
    },
  };
}

describe("Assessor", () => {
  const assessor = new Assessor();
  const baseInput = {
    scanId: "scan-001",
    projectId: "proj-1",
    commitHash: "abc123",
    orgSecret: "test-secret",
    hasTimeouts: false,
  };

  it("produces full_pass for clean scan", () => {
    const result = assessor.assess({
      ...baseInput,
      findingEvents: [makeFindingEvent("security-agent", [])],
    });

    expect(result.status).toBe("full_pass");
    expect(result.riskScore).toBe(0);
    expect(result.certificate).toBeDefined();
  });

  it("produces fail for critical findings", () => {
    const result = assessor.assess({
      ...baseInput,
      findingEvents: [
        makeFindingEvent("security-agent", [makeSecurityFinding("critical")]),
      ],
    });

    expect(result.status).toBe("fail");
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("produces partial when hasTimeouts is true and no critical", () => {
    const result = assessor.assess({
      ...baseInput,
      hasTimeouts: true,
      findingEvents: [makeFindingEvent("security-agent", [])],
    });

    expect(result.status).toBe("partial");
  });

  it("merges findings from multiple agents", () => {
    const result = assessor.assess({
      ...baseInput,
      findingEvents: [
        makeFindingEvent("security-agent", [makeSecurityFinding("medium")]),
        makeFindingEvent("license-agent", []),
      ],
    });

    expect(result.findings).toHaveLength(1);
    expect(result.agentResults).toHaveLength(2);
  });

  it("reEvaluate adds new findings and recalculates", () => {
    const initial = assessor.assess({
      ...baseInput,
      findingEvents: [makeFindingEvent("security-agent", [])],
    });

    expect(initial.status).toBe("full_pass");

    const updated = assessor.reEvaluate(
      initial,
      [makeSecurityFinding("critical")],
      "test-secret",
    );

    expect(updated.status).toBe("fail");
    expect(updated.findings).toHaveLength(1);
    expect(updated.id).toBe(initial.id); // same assessment id
  });

  it("reEvaluate is idempotent with same findings", () => {
    const initial = assessor.assess({
      ...baseInput,
      findingEvents: [
        makeFindingEvent("security-agent", [makeSecurityFinding("low")]),
      ],
    });

    const extra = [makeSecurityFinding("medium")];
    const r1 = assessor.reEvaluate(initial, extra, "test-secret");
    const r2 = assessor.reEvaluate(initial, extra, "test-secret");

    expect(r1.riskScore).toBe(r2.riskScore);
    expect(r1.status).toBe(r2.status);
    expect(r1.findings.length).toBe(r2.findings.length);
  });
});
