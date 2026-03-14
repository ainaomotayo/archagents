import { describe, it, expect } from "vitest";
import {
  correlateFindings,
  extractPackageName,
} from "./correlator.js";
import type {
  LicenseFinding,
  DependencyFinding,
  SecurityFinding,
  PolicyFinding,
} from "@sentinel/shared";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeLicenseFinding(
  overrides: Partial<LicenseFinding> = {},
): LicenseFinding {
  return {
    type: "license",
    file: "node_modules/leftpad/LICENSE",
    lineStart: 1,
    lineEnd: 5,
    severity: "high",
    confidence: "high",
    findingType: "copyleft-risk",
    licenseDetected: "GPL-3.0",
    similarityScore: 0.98,
    sourceMatch: null,
    policyAction: "block",
    ...overrides,
  };
}

function makeDependencyFinding(
  overrides: Partial<DependencyFinding> = {},
): DependencyFinding {
  return {
    type: "dependency",
    file: "package.json",
    lineStart: 12,
    lineEnd: 12,
    severity: "high",
    confidence: "high",
    package: "leftpad",
    findingType: "cve",
    detail: "Known vulnerability CVE-2024-1234",
    existingAlternative: "string-pad",
    cveId: "CVE-2024-1234",
    ...overrides,
  };
}

function makeSecurityFinding(): SecurityFinding {
  return {
    type: "security",
    file: "src/app.ts",
    lineStart: 10,
    lineEnd: 15,
    severity: "medium",
    confidence: "high",
    category: "injection",
    title: "SQL Injection",
    description: "Unsanitised input",
    remediation: "Use parameterised queries",
    scanner: "semgrep",
    cweId: "CWE-89",
  };
}

// ---------------------------------------------------------------------------
// extractPackageName
// ---------------------------------------------------------------------------

describe("extractPackageName", () => {
  it("extracts package name from DependencyFinding", () => {
    const f = makeDependencyFinding({ package: "LeftPad" });
    expect(extractPackageName(f)).toBe("leftpad");
  });

  it("extracts package name from LicenseFinding via sourceMatch URL", () => {
    const f = makeLicenseFinding({
      sourceMatch: "https://github.com/user/LeftPad/",
    });
    expect(extractPackageName(f)).toBe("leftpad");
  });

  it("extracts package name from LicenseFinding via node_modules path", () => {
    const f = makeLicenseFinding({
      sourceMatch: null,
      file: "node_modules/some-lib/dist/index.js",
    });
    expect(extractPackageName(f)).toBe("some-lib");
  });

  it("returns null for SecurityFinding", () => {
    expect(extractPackageName(makeSecurityFinding())).toBeNull();
  });

  it("returns null when LicenseFinding has no sourceMatch and non-node_modules path", () => {
    const f = makeLicenseFinding({
      sourceMatch: null,
      file: "src/lib/utils.ts",
    });
    expect(extractPackageName(f)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// correlateFindings – copyleft + CVE escalation
// ---------------------------------------------------------------------------

describe("correlateFindings", () => {
  it("produces CRITICAL policy finding when copyleft + CVE match same package", () => {
    const findings = [
      makeLicenseFinding({
        file: "node_modules/leftpad/LICENSE",
        licenseDetected: "GPL-3.0",
      }),
      makeDependencyFinding({
        package: "leftpad",
        cveId: "CVE-2024-1234",
        existingAlternative: "string-pad",
      }),
    ];

    const correlated = correlateFindings(findings);

    expect(correlated).toHaveLength(1);
    const pf = correlated[0] as PolicyFinding;
    expect(pf.type).toBe("policy");
    expect(pf.severity).toBe("critical");
    expect(pf.confidence).toBe("high");
    expect(pf.policyName).toBe("copyleft-cve-escalation");
    expect(pf.policySource).toBe("inferred");
    expect(pf.violation).toContain("leftpad");
    expect(pf.violation).toContain("GPL-3.0");
    expect(pf.violation).toContain("CVE-2024-1234");
    expect(pf.requiredAlternative).toBe("string-pad");
  });

  it("produces no findings when copyleft and CVE are for different packages", () => {
    const findings = [
      makeLicenseFinding({
        file: "node_modules/leftpad/LICENSE",
        licenseDetected: "GPL-3.0",
      }),
      makeDependencyFinding({
        package: "other-pkg",
        cveId: "CVE-2024-9999",
      }),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(0);
  });

  it("produces no findings when no copyleft findings exist", () => {
    const findings = [
      makeDependencyFinding({ package: "leftpad", cveId: "CVE-2024-1234" }),
      makeSecurityFinding(),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(0);
  });

  it("produces no findings when no CVE findings exist", () => {
    const findings = [
      makeLicenseFinding({ licenseDetected: "GPL-3.0" }),
      makeSecurityFinding(),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(0);
  });

  it("ignores non-copyleft licenses", () => {
    const findings = [
      makeLicenseFinding({ licenseDetected: "MIT" }),
      makeDependencyFinding({ package: "leftpad", cveId: "CVE-2024-1234" }),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(0);
  });

  it("deduplicates correlated findings for the same package", () => {
    const findings = [
      makeLicenseFinding({
        file: "node_modules/leftpad/LICENSE",
        licenseDetected: "GPL-3.0",
      }),
      makeLicenseFinding({
        file: "node_modules/leftpad/COPYING",
        licenseDetected: "GPL-3.0",
      }),
      makeDependencyFinding({ package: "leftpad", cveId: "CVE-2024-1234" }),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(1);
  });

  it("matches via sourceMatch URL on LicenseFinding", () => {
    const findings = [
      makeLicenseFinding({
        sourceMatch: "https://github.com/user/leftpad",
        file: "src/vendor/utils.ts",
        licenseDetected: "AGPL-3.0",
      }),
      makeDependencyFinding({ package: "leftpad", cveId: "CVE-2024-5555" }),
    ];

    const correlated = correlateFindings(findings);
    expect(correlated).toHaveLength(1);
    expect((correlated[0] as PolicyFinding).violation).toContain("AGPL-3.0");
  });

  it("returns empty array when findings list is empty", () => {
    expect(correlateFindings([])).toEqual([]);
  });
});
