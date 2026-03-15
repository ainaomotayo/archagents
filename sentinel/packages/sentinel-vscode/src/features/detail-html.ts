interface Finding {
  id: string;
  severity: string;
  title: string | null;
  description: string | null;
  remediation: string | null;
  category: string | null;
  file: string;
  lineStart: number;
  lineEnd: number;
  agentName: string;
  confidence: number;
  cweId: string | null;
  createdAt: string;
  [key: string]: unknown;
}

interface Signal {
  category: string;
  weight: number;
  confidence: number;
}

interface DetailExtras {
  complianceTags?: string[];
  decisionTrace?: { overallScore: number; signals: Signal[] };
  relatedFindings?: Finding[];
  history?: Array<{ status: string; timestamp: string }>;
}

const severityColors: Record<string, string> = {
  critical: "#e53e3e",
  high: "#ed8936",
  medium: "#ecc94b",
  low: "#4299e1",
  info: "#a0aec0",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDetailHtml(finding: Finding, extras: DetailExtras, cssUri?: string): string {
  const sev = finding.severity;
  const sevColor = severityColors[sev] ?? "#a0aec0";
  const confidencePct = Math.round(finding.confidence * 100);

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">`;
  if (cssUri) {
    html += `<link rel="stylesheet" href="${cssUri}">`;
  }
  html += `<style>
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; line-height: 1.6; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #fff; }
    .section { margin-top: 16px; }
    .section h3 { font-size: 13px; margin-bottom: 4px; color: var(--vscode-descriptionForeground); }
    .tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); margin: 2px 2px; }
    .signal-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--vscode-widget-border); font-size: 12px; }
    a { color: var(--vscode-textLink-foreground); }
    code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  </style></head><body>`;

  // Header
  html += `<div><span class="badge" style="background:${sevColor}">${escapeHtml(sev.toUpperCase())}</span>`;
  html += ` <span class="tag">${escapeHtml(finding.agentName)}</span>`;
  html += ` <span style="font-size:12px;color:var(--vscode-descriptionForeground)"> ${confidencePct}% confidence</span></div>`;

  // Title
  html += `<h2 style="margin:8px 0 4px">${escapeHtml(finding.title ?? finding.category ?? "Finding")}</h2>`;
  html += `<div style="font-size:12px;color:var(--vscode-descriptionForeground)">${escapeHtml(finding.file)}:${finding.lineStart}-${finding.lineEnd}</div>`;

  // Description
  if (finding.description) {
    html += `<div class="section"><h3>Description</h3><p style="font-size:13px">${escapeHtml(finding.description)}</p></div>`;
  }

  // Remediation
  if (finding.remediation) {
    html += `<div class="section"><h3>Remediation</h3><p style="font-size:13px">${escapeHtml(finding.remediation)}</p></div>`;
  }

  // Metadata
  html += `<div class="section"><h3>Metadata</h3><div style="font-size:12px">`;
  if (finding.cweId) {
    html += `<div>CWE: <a href="https://cwe.mitre.org/data/definitions/${finding.cweId.replace("CWE-", "")}.html">${escapeHtml(finding.cweId)}</a></div>`;
  }
  if (finding.category) {
    html += `<div>Category: <code>${escapeHtml(finding.category)}</code></div>`;
  }
  html += `<div>Detected: ${escapeHtml(new Date(finding.createdAt).toLocaleDateString())}</div>`;
  html += `</div></div>`;

  // Compliance tags
  if (extras.complianceTags && extras.complianceTags.length > 0) {
    html += `<div class="section"><h3>Compliance</h3><div>`;
    for (const tag of extras.complianceTags) {
      html += `<span class="tag">${escapeHtml(tag)}</span>`;
    }
    html += `</div></div>`;
  }

  // Decision trace
  if (extras.decisionTrace) {
    const trace = extras.decisionTrace;
    html += `<div class="section"><h3>Decision Trace</h3>`;
    html += `<div style="font-size:12px;margin-bottom:8px">Overall AI detection score: <strong>${Math.round(trace.overallScore * 100)}%</strong></div>`;
    for (const signal of trace.signals) {
      html += `<div class="signal-row"><span>${escapeHtml(signal.category)}</span><span>weight: ${signal.weight} | confidence: ${Math.round(signal.confidence * 100)}%</span></div>`;
    }
    html += `</div>`;
  }

  // History
  if (extras.history && extras.history.length > 0) {
    html += `<div class="section"><h3>History</h3><div style="font-size:12px">`;
    for (const entry of extras.history) {
      html += `<div>${escapeHtml(new Date(entry.timestamp).toLocaleDateString())} — ${escapeHtml(entry.status)}</div>`;
    }
    html += `</div></div>`;
  }

  html += `</body></html>`;
  return html;
}
