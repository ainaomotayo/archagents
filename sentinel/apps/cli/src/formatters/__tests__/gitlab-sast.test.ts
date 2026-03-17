import { describe, it, expect, vi } from "vitest";
import type { SecurityFinding, DependencyFinding, Finding } from "@sentinel/shared";
import { formatGitLabSast } from "../gitlab-sast.js";

function makeSecurityFinding(overrides = {}): SecurityFinding {
  return {
    type: "security",
    file: "src/auth.ts",
    lineStart: 10,
    lineEnd: 15,
    severity: "high",
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "User input passed to query",
    remediation: "Use parameterized queries",
    scanner: "semgrep",
    cweId: "CWE-89",
    ...overrides,
  };
}

function makeDepFinding(overrides = {}): DependencyFinding {
  return {
    type: "dependency",
    file: "package.json",
    lineStart: 5,
    lineEnd: 5,
    severity: "critical",
    confidence: "high",
    package: "lodash",
    findingType: "cve",
    detail: "Prototype pollution",
    existingAlternative: null,
    cveId: "CVE-2021-23337",
    ...overrides,
  };
}

describe("formatGitLabSast", () => {
  it("produces valid GitLab SAST report structure", () => {
    const report = formatGitLabSast([makeSecurityFinding()]);
    expect(report.version).toBe("15.1.0");
    expect(report.scan.type).toBe("sast");
    expect(report.scan.analyzer.id).toBe("sentinel");
    expect(report.scan.analyzer.name).toBe("Sentinel");
    expect(report.vulnerabilities).toHaveLength(1);
  });

  it("maps severity correctly", () => {
    const findings: Finding[] = [
      makeSecurityFinding({ severity: "critical" }),
      makeSecurityFinding({ severity: "high" }),
      makeSecurityFinding({ severity: "medium" }),
      makeSecurityFinding({ severity: "low" }),
    ];
    const report = formatGitLabSast(findings);
    expect(report.vulnerabilities[0].severity).toBe("Critical");
    expect(report.vulnerabilities[1].severity).toBe("High");
    expect(report.vulnerabilities[2].severity).toBe("Medium");
    expect(report.vulnerabilities[3].severity).toBe("Low");
  });

  it("includes file location info", () => {
    const report = formatGitLabSast([makeSecurityFinding()]);
    const vuln = report.vulnerabilities[0];
    expect(vuln.location.file).toBe("src/auth.ts");
    expect(vuln.location.start_line).toBe(10);
    expect(vuln.location.end_line).toBe(15);
  });

  it("includes CWE identifiers for security findings", () => {
    const report = formatGitLabSast([makeSecurityFinding({ cweId: "CWE-89" })]);
    const vuln = report.vulnerabilities[0];
    const cwe = vuln.identifiers.find((id: { type: string }) => id.type === "cwe");
    expect(cwe).toBeDefined();
    expect(cwe!.name).toBe("CWE-89");
    expect(cwe!.value).toBe("CWE-89");
  });

  it("includes CVE identifiers for dependency findings", () => {
    const report = formatGitLabSast([makeDepFinding({ cveId: "CVE-2021-23337" })]);
    const vuln = report.vulnerabilities[0];
    const cve = vuln.identifiers.find((id: { type: string }) => id.type === "cve");
    expect(cve).toBeDefined();
    expect(cve!.name).toBe("CVE-2021-23337");
    expect(cve!.value).toBe("CVE-2021-23337");
  });

  it("handles empty findings array", () => {
    const report = formatGitLabSast([]);
    expect(report.vulnerabilities).toHaveLength(0);
    expect(report.version).toBe("15.1.0");
    expect(report.scan.type).toBe("sast");
  });

  it("generates unique IDs per vulnerability", () => {
    const report = formatGitLabSast([
      makeSecurityFinding(),
      makeSecurityFinding(),
      makeDepFinding(),
    ]);
    const ids = report.vulnerabilities.map((v) => v.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(3);
    // Each ID should be a valid UUID format
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("sets category to sast for all vulnerabilities", () => {
    const report = formatGitLabSast([
      makeSecurityFinding(),
      makeDepFinding(),
    ]);
    for (const vuln of report.vulnerabilities) {
      expect(vuln.category).toBe("sast");
    }
  });
});
