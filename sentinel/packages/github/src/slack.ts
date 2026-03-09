/**
 * Slack Block Kit message builders for SENTINEL notifications.
 *
 * Produces Block Kit payloads that can be sent via the Slack Web API
 * (chat.postMessage) or incoming webhooks.
 */

// ── Types ──

export interface SlackBlockMessage {
  blocks: SlackBlock[];
  text: string; // fallback text for notifications
}

export type SlackBlock =
  | SectionBlock
  | DividerBlock
  | ContextBlock
  | ActionsBlock;

interface SectionBlock {
  type: "section";
  text: { type: "mrkdwn"; text: string };
  accessory?: {
    type: "button";
    text: { type: "plain_text"; text: string };
    url: string;
  };
}

interface DividerBlock {
  type: "divider";
}

interface ContextBlock {
  type: "context";
  elements: Array<{ type: "mrkdwn"; text: string }>;
}

interface ActionsBlock {
  type: "actions";
  elements: Array<{
    type: "button";
    text: { type: "plain_text"; text: string };
    url: string;
    style?: "primary" | "danger";
  }>;
}

// ── Helpers ──

function riskEmoji(score: number): string {
  if (score <= 25) return ":white_check_mark:";
  if (score <= 50) return ":warning:";
  return ":rotating_light:";
}

function statusLabel(status: string): string {
  switch (status) {
    case "full_pass":
      return "FULL PASS";
    case "provisional_pass":
      return "PROVISIONAL PASS";
    case "fail":
      return "FAIL";
    case "revoked":
      return "REVOKED";
    default:
      return status.toUpperCase();
  }
}

// ── Builders ──

/**
 * Build Slack notification for scan completion.
 */
export function buildScanCompleteMessage(scan: {
  projectName: string;
  commitHash: string;
  branch: string;
  status: string;
  riskScore: number;
  findingCount: number;
  dashboardUrl: string;
}): SlackBlockMessage {
  const emoji = riskEmoji(scan.riskScore);
  const label = statusLabel(scan.status);
  const shortHash = scan.commitHash.slice(0, 7);

  return {
    text: `SENTINEL scan complete for ${scan.projectName}: ${label} (risk ${scan.riskScore}/100)`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *SENTINEL Scan Complete*\n*Project:* ${scan.projectName}\n*Branch:* \`${scan.branch}\` (\`${shortHash}\`)`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Status:* ${label}\n*Risk Score:* ${scan.riskScore}/100\n*Findings:* ${scan.findingCount}`,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View Report" },
          url: scan.dashboardUrl,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Commit \`${shortHash}\` on \`${scan.branch}\`` },
        ],
      },
    ],
  };
}

/**
 * Build Slack notification for certificate revocation.
 */
export function buildRevocationMessage(cert: {
  projectName: string;
  commitHash: string;
  revokedBy: string;
  reason: string;
  dashboardUrl: string;
}): SlackBlockMessage {
  const shortHash = cert.commitHash.slice(0, 7);

  return {
    text: `SENTINEL certificate revoked for ${cert.projectName} by ${cert.revokedBy}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rotating_light: *Certificate Revoked*\n*Project:* ${cert.projectName}\n*Commit:* \`${shortHash}\``,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Revoked by:* ${cert.revokedBy}\n*Reason:* ${cert.reason}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Details" },
            url: cert.dashboardUrl,
            style: "danger",
          },
        ],
      },
    ],
  };
}

/**
 * Build Slack notification for a critical finding.
 */
export function buildCriticalFindingMessage(finding: {
  projectName: string;
  title: string;
  severity: string;
  file: string;
  dashboardUrl: string;
}): SlackBlockMessage {
  return {
    text: `SENTINEL critical finding in ${finding.projectName}: ${finding.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rotating_light: *Critical Finding Detected*\n*Project:* ${finding.projectName}`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Title:* ${finding.title}\n*Severity:* ${finding.severity}\n*File:* \`${finding.file}\``,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View Finding" },
          url: finding.dashboardUrl,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Severity: *${finding.severity}* | File: \`${finding.file}\`` },
        ],
      },
    ],
  };
}
