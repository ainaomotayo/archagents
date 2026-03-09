import { describe, it, expect } from "vitest";
import type {
  SentinelDiffPayload,
  SecurityFinding,
  LicenseFinding,
  QualityFinding,
  PolicyFinding,
  DependencyFinding,
  AIDetectionFinding,
  Finding,
  ComplianceAssessment,
  ComplianceCertificate,
  AuditEvent,
  AgentResult,
  CategoryScore,
} from "./types.js";

describe("SentinelDiffPayload", () => {
  it("should construct a valid payload with files, hunks, and scanConfig", () => {
    const payload: SentinelDiffPayload = {
      projectId: "proj-123",
      commitHash: "abc123def456",
      branch: "main",
      author: "dev@example.com",
      timestamp: "2026-03-09T00:00:00Z",
      files: [
        {
          path: "src/index.ts",
          language: "typescript",
          hunks: [
            {
              oldStart: 1,
              oldCount: 5,
              newStart: 1,
              newCount: 8,
              content: "@@ -1,5 +1,8 @@\n+import { foo } from 'bar';",
            },
          ],
          aiScore: 0.85,
        },
      ],
      toolHints: {
        tool: "copilot",
        markers: ["generated-by-ai"],
      },
      scanConfig: {
        securityLevel: "strict",
        licensePolicy: "enterprise-default",
        qualityThreshold: 80,
      },
    };

    expect(payload.projectId).toBe("proj-123");
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0].hunks).toHaveLength(1);
    expect(payload.files[0].hunks[0].oldStart).toBe(1);
    expect(payload.files[0].aiScore).toBe(0.85);
    expect(payload.scanConfig.securityLevel).toBe("strict");
    expect(payload.toolHints?.tool).toBe("copilot");
  });
});

describe("SecurityFinding", () => {
  it("should construct a valid security finding with all fields", () => {
    const finding: SecurityFinding = {
      type: "security",
      file: "src/auth.ts",
      lineStart: 10,
      lineEnd: 15,
      severity: "critical",
      confidence: "high",
      category: "injection",
      title: "SQL Injection Vulnerability",
      description: "User input is directly interpolated into SQL query",
      remediation: "Use parameterized queries instead of string interpolation",
      scanner: "semgrep",
      cweId: "CWE-89",
    };

    expect(finding.type).toBe("security");
    expect(finding.severity).toBe("critical");
    expect(finding.scanner).toBe("semgrep");
    expect(finding.cweId).toBe("CWE-89");
    expect(finding.lineStart).toBe(10);
    expect(finding.lineEnd).toBe(15);
    expect(finding.category).toBe("injection");
    expect(finding.remediation).toContain("parameterized");
  });
});

describe("Finding union type discrimination", () => {
  it("should discriminate SecurityFinding by type", () => {
    const finding: Finding = {
      type: "security",
      file: "src/auth.ts",
      lineStart: 1,
      lineEnd: 5,
      severity: "high",
      confidence: "high",
      category: "xss",
      title: "XSS",
      description: "Cross-site scripting",
      remediation: "Sanitize output",
      scanner: "llm-review",
      cweId: null,
    };
    expect(finding.type).toBe("security");
    if (finding.type === "security") {
      expect(finding.scanner).toBe("llm-review");
    }
  });

  it("should discriminate LicenseFinding by type", () => {
    const finding: Finding = {
      type: "license",
      file: "src/utils.ts",
      lineStart: 1,
      lineEnd: 20,
      severity: "high",
      confidence: "medium",
      findingType: "copyleft-risk",
      licenseDetected: "GPL-3.0",
      similarityScore: 0.92,
      sourceMatch: "github.com/example/repo",
      policyAction: "block",
    };
    expect(finding.type).toBe("license");
    if (finding.type === "license") {
      expect(finding.findingType).toBe("copyleft-risk");
      expect(finding.similarityScore).toBe(0.92);
      expect(finding.policyAction).toBe("block");
    }
  });

  it("should discriminate QualityFinding by type", () => {
    const finding: Finding = {
      type: "quality",
      file: "src/complex.ts",
      lineStart: 5,
      lineEnd: 50,
      severity: "medium",
      confidence: "high",
      metric: "complexity",
      score: 25,
      detail: "Cyclomatic complexity of 25 exceeds threshold of 10",
      suggestion: "Extract into smaller functions",
    };
    expect(finding.type).toBe("quality");
    if (finding.type === "quality") {
      expect(finding.metric).toBe("complexity");
      expect(finding.score).toBe(25);
    }
  });

  it("should discriminate PolicyFinding by type", () => {
    const finding: Finding = {
      type: "policy",
      file: "src/api.ts",
      lineStart: 1,
      lineEnd: 3,
      severity: "high",
      confidence: "high",
      policyName: "no-console-log",
      policySource: "repo",
      violation: "console.log statements are not allowed in production code",
      requiredAlternative: "Use the logger service instead",
    };
    expect(finding.type).toBe("policy");
    if (finding.type === "policy") {
      expect(finding.policyName).toBe("no-console-log");
      expect(finding.policySource).toBe("repo");
    }
  });

  it("should discriminate DependencyFinding by type", () => {
    const finding: Finding = {
      type: "dependency",
      file: "package.json",
      lineStart: 10,
      lineEnd: 10,
      severity: "critical",
      confidence: "high",
      package: "lodash",
      findingType: "cve",
      detail: "Known vulnerability CVE-2021-23337",
      existingAlternative: "lodash-es",
      cveId: "CVE-2021-23337",
    };
    expect(finding.type).toBe("dependency");
    if (finding.type === "dependency") {
      expect(finding.package).toBe("lodash");
      expect(finding.cveId).toBe("CVE-2021-23337");
    }
  });

  it("should discriminate AIDetectionFinding by type", () => {
    const finding: Finding = {
      type: "ai-detection",
      file: "src/generated.ts",
      lineStart: 1,
      lineEnd: 100,
      severity: "info",
      confidence: "medium",
      aiProbability: 0.95,
      detectionMethod: "stylometric-analysis",
      toolAttribution: "copilot",
    };
    expect(finding.type).toBe("ai-detection");
    if (finding.type === "ai-detection") {
      expect(finding.aiProbability).toBe(0.95);
      expect(finding.toolAttribution).toBe("copilot");
    }
  });
});

describe("ComplianceAssessment", () => {
  it("should construct a valid assessment with all nested structures", () => {
    const categoryScore: CategoryScore = {
      score: 85,
      status: "pass",
      findings: { critical: 0, high: 1, medium: 2, low: 3 },
    };

    const agentResult: AgentResult = {
      agentName: "security-scanner",
      agentVersion: "1.0.0",
      rulesetVersion: "2026.03",
      rulesetHash: "sha256:abc123",
      status: "completed",
      findingCount: 3,
      durationMs: 1500,
    };

    const assessment: ComplianceAssessment = {
      id: "assess-001",
      commitHash: "abc123def456",
      projectId: "proj-123",
      timestamp: "2026-03-09T00:00:00Z",
      status: "provisional_pass",
      riskScore: 35,
      categories: {
        security: categoryScore,
        license: { ...categoryScore, score: 90, status: "pass" },
        quality: { ...categoryScore, score: 70, status: "warn" },
        policy: { ...categoryScore, score: 95, status: "pass" },
        dependency: { ...categoryScore, score: 60, status: "warn" },
      },
      findings: [],
      agentResults: [agentResult],
      drift: {
        aiComposition: {
          thisCommit: 0.45,
          projectBaseline: 0.30,
          deviationFactor: 1.5,
          riskFlag: true,
          trend: "increasing",
        },
        dependencyDrift: {
          newDeps: ["new-package"],
          categoryConflicts: [
            {
              category: "http-client",
              existing: "axios",
              introduced: "got",
            },
          ],
        },
      },
    };

    expect(assessment.id).toBe("assess-001");
    expect(assessment.status).toBe("provisional_pass");
    expect(assessment.riskScore).toBe(35);
    expect(assessment.categories.security.score).toBe(85);
    expect(assessment.categories.quality.status).toBe("warn");
    expect(assessment.drift.aiComposition.riskFlag).toBe(true);
    expect(assessment.drift.aiComposition.trend).toBe("increasing");
    expect(assessment.drift.dependencyDrift.newDeps).toContain("new-package");
    expect(assessment.drift.dependencyDrift.categoryConflicts).toHaveLength(1);
    expect(assessment.agentResults[0].agentName).toBe("security-scanner");
    expect(assessment.agentResults[0].status).toBe("completed");
  });
});

describe("ComplianceCertificate", () => {
  it("should construct a valid certificate with all nested structures", () => {
    const certificate: ComplianceCertificate = {
      id: "cert-001",
      version: "1.0",
      subject: {
        projectId: "proj-123",
        repository: "github.com/org/repo",
        commitHash: "abc123def456",
        branch: "main",
        author: "dev@example.com",
        timestamp: "2026-03-09T00:00:00Z",
      },
      verdict: {
        status: "pass",
        riskScore: 15,
        categories: {
          security: "pass",
          license: "pass",
          quality: "warn",
        },
      },
      scanMetadata: {
        agents: [
          {
            name: "security-scanner",
            version: "1.0.0",
            rulesetVersion: "2026.03",
            rulesetHash: "sha256:abc123",
            status: "completed",
            findingCount: 2,
            durationMs: 1500,
          },
        ],
        environmentHash: "sha256:env-hash-123",
        totalDurationMs: 5000,
        scanLevel: "strict",
      },
      compliance: {
        euAiAct: {
          riskCategory: "limited",
          documentationComplete: true,
          humanOversightVerified: true,
        },
        soc2: { controlsMapped: ["CC6.1", "CC6.2"] },
        iso27001: { controlsMapped: ["A.12.6.1"] },
      },
      signature: "sig-sha256-abc123",
      issuedAt: "2026-03-09T00:00:00Z",
      expiresAt: "2026-04-09T00:00:00Z",
    };

    expect(certificate.id).toBe("cert-001");
    expect(certificate.version).toBe("1.0");
    expect(certificate.subject.projectId).toBe("proj-123");
    expect(certificate.subject.repository).toBe("github.com/org/repo");
    expect(certificate.verdict.status).toBe("pass");
    expect(certificate.verdict.riskScore).toBe(15);
    expect(certificate.verdict.categories["security"]).toBe("pass");
    expect(certificate.scanMetadata.agents).toHaveLength(1);
    expect(certificate.scanMetadata.agents[0].status).toBe("completed");
    expect(certificate.scanMetadata.scanLevel).toBe("strict");
    expect(certificate.compliance.euAiAct?.riskCategory).toBe("limited");
    expect(certificate.compliance.soc2?.controlsMapped).toContain("CC6.1");
    expect(certificate.compliance.iso27001?.controlsMapped).toContain("A.12.6.1");
    expect(certificate.signature).toBe("sig-sha256-abc123");
    expect(certificate.issuedAt).toBe("2026-03-09T00:00:00Z");
    expect(certificate.expiresAt).toBe("2026-04-09T00:00:00Z");
  });
});

describe("AuditEvent", () => {
  it("should construct a valid audit event with all fields", () => {
    const event: AuditEvent = {
      id: "evt-001",
      timestamp: "2026-03-09T00:00:00Z",
      actor: {
        type: "user",
        id: "user-123",
        name: "dev@example.com",
        ip: "192.168.1.1",
      },
      action: "scan.initiated",
      resource: {
        type: "scan",
        id: "scan-001",
      },
      detail: { trigger: "push", ref: "refs/heads/main" },
      previousEventHash: "sha256:prev-hash",
      eventHash: "sha256:current-hash",
    };

    expect(event.id).toBe("evt-001");
    expect(event.actor.type).toBe("user");
    expect(event.actor.id).toBe("user-123");
    expect(event.actor.ip).toBe("192.168.1.1");
    expect(event.action).toBe("scan.initiated");
    expect(event.resource.type).toBe("scan");
    expect(event.resource.id).toBe("scan-001");
    expect(event.detail).toHaveProperty("trigger", "push");
    expect(event.previousEventHash).toBe("sha256:prev-hash");
    expect(event.eventHash).toBe("sha256:current-hash");
  });
});
