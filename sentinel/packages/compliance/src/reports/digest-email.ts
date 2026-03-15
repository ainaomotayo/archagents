import type { DigestMetrics } from "../types.js";

function formatDelta(value: number): string {
  if (value > 0) return `<span style="color:#22c55e;">+${value}</span>`;
  if (value < 0) return `<span style="color:#ef4444;">${value}</span>`;
  return `<span style="color:#6b7280;">0</span>`;
}

function formatPercentDelta(value: number): string {
  const pct = Math.round(value * 100);
  if (pct > 0) return `<span style="color:#22c55e;">+${pct}%</span>`;
  if (pct < 0) return `<span style="color:#ef4444;">${pct}%</span>`;
  return `<span style="color:#6b7280;">0%</span>`;
}

function severityColor(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical": return "#dc2626";
    case "high": return "#f97316";
    case "medium": return "#eab308";
    case "low": return "#3b82f6";
    default: return "#6b7280";
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDigestEmailHtml(
  orgName: string,
  metrics: DigestMetrics,
  dashboardUrl: string,
): string {
  const {
    scanVolume,
    findingSummary,
    frameworkScores,
    attestationSummary,
    remediationSummary,
    aiMetrics,
    topFindings,
  } = metrics;

  const complianceUrl = `${dashboardUrl}/compliance`;
  const safeOrg = escapeHtml(orgName);

  const severities = [
    { label: "Critical", count: findingSummary.critical, delta: findingSummary.weekOverWeek.critical, color: "#dc2626" },
    { label: "High", count: findingSummary.high, delta: findingSummary.weekOverWeek.high, color: "#f97316" },
    { label: "Medium", count: findingSummary.medium, delta: findingSummary.weekOverWeek.medium, color: "#eab308" },
    { label: "Low", count: findingSummary.low, delta: findingSummary.weekOverWeek.low, color: "#3b82f6" },
  ];

  const findingsRows = severities
    .map(
      (s) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:8px;"></span>${s.label}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${s.count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatDelta(s.delta)}</td>
        </tr>`,
    )
    .join("\n");

  const frameworkRows = frameworkScores
    .map((fw) => {
      const pct = Math.round(fw.score * 100);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(fw.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:200px;">
          <div style="background:#e5e7eb;border-radius:4px;height:16px;width:100%;">
            <div style="background:#3b82f6;border-radius:4px;height:16px;width:${pct}%;"></div>
          </div>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${pct}%</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatPercentDelta(fw.delta)}</td>
      </tr>`;
    })
    .join("\n");

  const topFindingsRows = topFindings
    .map(
      (f) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(f.title)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">
            <span style="color:${severityColor(f.severity)};font-weight:600;">${escapeHtml(f.severity.charAt(0).toUpperCase() + f.severity.slice(1))}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${f.count}</td>
        </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sentinel Weekly Digest - ${safeOrg}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:24px 32px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:700;">Sentinel Weekly Digest</h1>
              <p style="margin:8px 0 0;font-size:14px;opacity:0.85;">${safeOrg}</p>
            </td>
          </tr>

          <!-- Scan Activity -->
          <tr>
            <td style="padding:24px 32px 16px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Scan Activity</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:32px;font-weight:700;color:#1e3a5f;">${scanVolume.total}</td>
                  <td style="text-align:right;font-size:14px;">Week-over-week: ${formatDelta(scanVolume.weekOverWeek)}</td>
                </tr>
              </table>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Total scans this week</p>
            </td>
          </tr>

          <!-- Findings Summary -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Findings Summary</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;">
                <tr style="background:#f9fafb;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Severity</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Count</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">WoW</th>
                </tr>
                ${findingsRows}
              </table>
            </td>
          </tr>

          <!-- Compliance Scores -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Compliance Scores</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;">
                <tr style="background:#f9fafb;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Framework</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Score</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">%</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Delta</th>
                </tr>
                ${frameworkRows}
              </table>
            </td>
          </tr>

          <!-- Attestations -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Attestations</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#1e3a5f;">${attestationSummary.attested}</div>
                    <div style="font-size:12px;color:#6b7280;">Active</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#ef4444;">${attestationSummary.expired}</div>
                    <div style="font-size:12px;color:#6b7280;">Expired</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#f97316;">${attestationSummary.expiringSoon}</div>
                    <div style="font-size:12px;color:#6b7280;">Expiring Soon</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#6b7280;">${attestationSummary.total}</div>
                    <div style="font-size:12px;color:#6b7280;">Total</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Remediation -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Remediation</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#ef4444;">${remediationSummary.open}</div>
                    <div style="font-size:12px;color:#6b7280;">Open</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#f97316;">${remediationSummary.inProgress}</div>
                    <div style="font-size:12px;color:#6b7280;">In Progress</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#22c55e;">${remediationSummary.completed}</div>
                    <div style="font-size:12px;color:#6b7280;">Completed</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#1e3a5f;">${remediationSummary.avgResolutionHours}h</div>
                    <div style="font-size:12px;color:#6b7280;">Avg Resolution</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- AI Metrics -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">AI Metrics</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#1e3a5f;">${Math.round(aiMetrics.aiRatio * 100)}%</div>
                    <div style="font-size:12px;color:#6b7280;">AI Ratio</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;color:#1e3a5f;">${Math.round(aiMetrics.avgProbability * 100)}%</div>
                    <div style="font-size:12px;color:#6b7280;">Avg Probability</div>
                  </td>
                  <td style="text-align:center;padding:8px;">
                    <div style="font-size:24px;font-weight:700;">${formatPercentDelta(aiMetrics.weekOverWeek)}</div>
                    <div style="font-size:12px;color:#6b7280;">WoW Change</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Top Findings -->
          <tr>
            <td style="padding:16px 32px;">
              <h2 style="margin:0 0 12px;font-size:16px;color:#374151;">Top Findings</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;border-collapse:collapse;">
                <tr style="background:#f9fafb;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Finding</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Severity</th>
                  <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Count</th>
                </tr>
                ${topFindingsRows}
              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:24px 32px;text-align:center;">
              <a href="${complianceUrl}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-size:14px;font-weight:600;">View Compliance Dashboard</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated digest from Sentinel. You can manage notification preferences in your dashboard settings.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
