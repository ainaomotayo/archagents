/**
 * Cross-agent correlation rules for the assessor.
 *
 * Correlation rules examine findings from multiple agents and synthesise
 * new findings when combinations of conditions are detected (e.g. a package
 * that is both copyleft-licensed AND has a known CVE).
 */
import type {
  Finding,
  LicenseFinding,
  DependencyFinding,
  PolicyFinding,
} from "@sentinel/shared";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface CorrelationRule {
  name: string;
  description: string;
  apply(findings: Finding[]): Finding[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of a normalised package name from a finding.
 *
 * - DependencyFinding  -> `.package`
 * - LicenseFinding     -> last path segment of `.sourceMatch`, or the
 *   `node_modules/<pkg>` segment from `.file`
 */
export function extractPackageName(finding: Finding): string | null {
  if (finding.type === "dependency") {
    return (finding as DependencyFinding).package?.toLowerCase() ?? null;
  }
  if (finding.type === "license") {
    const lf = finding as LicenseFinding;
    if (lf.sourceMatch) {
      return (
        lf.sourceMatch
          .replace(/\/+$/, "")
          .split("/")
          .pop()
          ?.toLowerCase() ?? null
      );
    }
    const match = lf.file.match(/node_modules\/([^/]+)/);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Copyleft + CVE escalation rule
// ---------------------------------------------------------------------------

const COPYLEFT_LICENSES = new Set([
  "GPL-2.0",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MPL-2.0",
  "EUPL-1.2",
  "OSL-3.0",
  "SSPL-1.0",
]);

const copyleftCveRule: CorrelationRule = {
  name: "copyleft-cve-escalation",
  description:
    "Escalate to CRITICAL when copyleft license and CVE exist for the same package",

  apply(findings: Finding[]): Finding[] {
    const copyleftFindings = findings.filter(
      (f): f is LicenseFinding =>
        f.type === "license" &&
        (f as LicenseFinding).findingType === "copyleft-risk" &&
        COPYLEFT_LICENSES.has((f as LicenseFinding).licenseDetected ?? ""),
    );

    const cveFindings = findings.filter(
      (f): f is DependencyFinding =>
        f.type === "dependency" &&
        (f as DependencyFinding).findingType === "cve",
    );

    if (copyleftFindings.length === 0 || cveFindings.length === 0) {
      return [];
    }

    const cveByPackage = new Map<string, DependencyFinding>();
    for (const cve of cveFindings) {
      const name = extractPackageName(cve);
      if (name) cveByPackage.set(name, cve);
    }

    const correlated: PolicyFinding[] = [];
    const seen = new Set<string>();

    for (const lf of copyleftFindings) {
      const pkgName = extractPackageName(lf);
      if (!pkgName || seen.has(pkgName)) continue;

      const matchedCve = cveByPackage.get(pkgName);
      if (!matchedCve) continue;

      seen.add(pkgName);
      correlated.push({
        type: "policy",
        file: lf.file,
        lineStart: lf.lineStart,
        lineEnd: lf.lineEnd,
        severity: "critical",
        confidence: "high",
        policyName: "copyleft-cve-escalation",
        policySource: "inferred",
        violation: `Package "${pkgName}" has copyleft license (${lf.licenseDetected}) AND known vulnerability (${matchedCve.cveId}). Dual risk requires immediate remediation.`,
        requiredAlternative: matchedCve.existingAlternative,
      });
    }

    return correlated;
  },
};

// ---------------------------------------------------------------------------
// Default rule set & entry point
// ---------------------------------------------------------------------------

const DEFAULT_RULES: CorrelationRule[] = [copyleftCveRule];

/**
 * Run all correlation rules against the merged finding set and return any
 * synthesised findings.  The caller is responsible for appending these to the
 * original findings array.
 */
export function correlateFindings(
  findings: Finding[],
  rules: CorrelationRule[] = DEFAULT_RULES,
): Finding[] {
  const correlated: Finding[] = [];
  for (const rule of rules) {
    correlated.push(...rule.apply(findings));
  }
  return correlated;
}
