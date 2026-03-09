/**
 * SENTINEL Dashboard — Report Generator
 *
 * Generates compliance report data and HTML output suitable for
 * PDF conversion via browser print or a headless renderer.
 */

import type { Certificate, Finding, Scan } from "./types";

export interface ReportData {
  organization: string;
  generatedAt: string;
  period: { start: string; end: string };
  summary: {
    totalScans: number;
    passRate: number;
    riskTrend: "improving" | "stable" | "degrading";
    topFindings: Array<{ category: string; count: number }>;
  };
  compliance: {
    euAiAct: { compliant: boolean; gaps: string[] };
    soc2Controls: Array<{
      control: string;
      status: "met" | "partial" | "unmet";
    }>;
  };
}

/**
 * Derive a risk trend by comparing the average risk score of the
 * most recent half of scans against the older half.
 */
function computeRiskTrend(
  scans: Scan[],
): "improving" | "stable" | "degrading" {
  if (scans.length < 2) return "stable";

  const sorted = [...scans].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const mid = Math.floor(sorted.length / 2);
  const olderAvg =
    sorted.slice(0, mid).reduce((s, sc) => s + sc.riskScore, 0) / mid;
  const newerAvg =
    sorted.slice(mid).reduce((s, sc) => s + sc.riskScore, 0) /
    (sorted.length - mid);

  const delta = newerAvg - olderAvg;
  if (delta < -5) return "improving";
  if (delta > 5) return "degrading";
  return "stable";
}

/**
 * Aggregate findings into a sorted list of { category, count }.
 */
function aggregateFindings(
  findings: Finding[],
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const f of findings) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Build a ReportData object from raw domain entities.
 */
export function generateReportData(
  scans: Scan[],
  findings: Finding[],
  certificates: Certificate[],
  organization = "ACME Corp",
): ReportData {
  const passCount = scans.filter((s) => s.status === "pass").length;
  const passRate = scans.length > 0 ? Math.round((passCount / scans.length) * 100) : 0;

  const dates = scans.map((s) => new Date(s.date).getTime());
  const start = dates.length
    ? new Date(Math.min(...dates)).toISOString()
    : new Date().toISOString();
  const end = dates.length
    ? new Date(Math.max(...dates)).toISOString()
    : new Date().toISOString();

  const openFindings = findings.filter((f) => f.status === "open");
  const hasCritical = openFindings.some((f) => f.severity === "critical");
  const hasHigh = openFindings.some((f) => f.severity === "high");
  const activeCerts = certificates.filter((c) => c.status === "active");

  const gaps: string[] = [];
  if (hasCritical) gaps.push("Critical findings remain unresolved");
  if (hasHigh) gaps.push("High-severity findings require remediation");
  if (activeCerts.length === 0)
    gaps.push("No active certificates — continuous monitoring not verified");

  return {
    organization,
    generatedAt: new Date().toISOString(),
    period: { start, end },
    summary: {
      totalScans: scans.length,
      passRate,
      riskTrend: computeRiskTrend(scans),
      topFindings: aggregateFindings(openFindings).slice(0, 5),
    },
    compliance: {
      euAiAct: {
        compliant: gaps.length === 0,
        gaps,
      },
      soc2Controls: [
        {
          control: "CC6.1 — Logical Access",
          status: openFindings.some((f) => f.category === "security")
            ? "partial"
            : "met",
        },
        {
          control: "CC6.8 — Malicious Software Prevention",
          status: openFindings.some((f) => f.category === "dependency")
            ? "partial"
            : "met",
        },
        {
          control: "CC7.2 — System Monitoring",
          status: scans.length > 0 ? "met" : "unmet",
        },
        {
          control: "CC8.1 — Change Management",
          status:
            passRate >= 80 ? "met" : passRate >= 50 ? "partial" : "unmet",
        },
      ],
    },
  };
}

/**
 * Render a print-optimised HTML report from ReportData.
 */
export function generateReportHtml(data: ReportData): string {
  const trendLabel = {
    improving: "Improving",
    stable: "Stable",
    degrading: "Degrading",
  }[data.summary.riskTrend];

  const trendColor = {
    improving: "#22c55e",
    stable: "#eab308",
    degrading: "#ef4444",
  }[data.summary.riskTrend];

  const findingsRows = data.summary.topFindings
    .map(
      (f) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${f.category}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">${f.count}</td></tr>`,
    )
    .join("\n");

  const soc2Rows = data.compliance.soc2Controls
    .map((c) => {
      const color =
        c.status === "met"
          ? "#22c55e"
          : c.status === "partial"
            ? "#eab308"
            : "#ef4444";
      return (
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${c.control}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center">` +
        `<span style="color:${color};font-weight:600">${c.status.toUpperCase()}</span></td></tr>`
      );
    })
    .join("\n");

  const gapsList = data.compliance.euAiAct.gaps.length
    ? `<ul style="margin:0;padding-left:20px">${data.compliance.euAiAct.gaps.map((g) => `<li>${g}</li>`).join("")}</ul>`
    : "<p>No gaps identified.</p>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>SENTINEL Compliance Report — ${data.organization}</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 24px; color: #1e293b; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 18px; margin-top: 32px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; }
  .meta { color: #64748b; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; padding: 8px 12px; background: #f1f5f9; font-size: 13px; text-transform: uppercase; color: #64748b; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
  .stat-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .stat-card .label { font-size: 13px; color: #64748b; }
  .stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
</style>
</head>
<body>
  <h1>SENTINEL Compliance Report</h1>
  <p class="meta">${data.organization} &mdash; Generated ${new Date(data.generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
  <p class="meta">Period: ${new Date(data.period.start).toLocaleDateString()} &ndash; ${new Date(data.period.end).toLocaleDateString()}</p>

  <h2>Summary</h2>
  <div class="stat-grid">
    <div class="stat-card">
      <div class="label">Total Scans</div>
      <div class="value">${data.summary.totalScans}</div>
    </div>
    <div class="stat-card">
      <div class="label">Pass Rate</div>
      <div class="value">${data.summary.passRate}%</div>
    </div>
    <div class="stat-card">
      <div class="label">Risk Trend</div>
      <div class="value" style="color:${trendColor}">${trendLabel}</div>
    </div>
  </div>

  <h2>Top Findings by Category</h2>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>${findingsRows || "<tr><td colspan=\"2\" style=\"padding:12px;color:#64748b\">No open findings</td></tr>"}</tbody>
  </table>

  <h2>EU AI Act Compliance</h2>
  <p>Status: <strong style="color:${data.compliance.euAiAct.compliant ? "#22c55e" : "#ef4444"}">${data.compliance.euAiAct.compliant ? "COMPLIANT" : "NON-COMPLIANT"}</strong></p>
  ${data.compliance.euAiAct.gaps.length ? "<p><strong>Gaps:</strong></p>" : ""}
  ${gapsList}

  <h2>SOC 2 Control Mapping</h2>
  <table>
    <thead><tr><th>Control</th><th style="text-align:center">Status</th></tr></thead>
    <tbody>${soc2Rows}</tbody>
  </table>

  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
    Generated by SENTINEL &mdash; AI Code Integrity Platform
  </div>
</body>
</html>`;
}
