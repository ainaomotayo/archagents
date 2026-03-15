const JIRA_STATUS_MAP: Record<string, string> = {
  "To Do": "open",
  "In Progress": "in_progress",
  "In Review": "in_review",
  "Done": "completed",
};

const GITHUB_STATE_MAP: Record<string, string> = {
  open: "open",
  closed: "completed",
};

export class SyncHandler {
  constructor(private db: any, private eventBus: any) {}

  async handleJiraWebhook(payload: any, orgId: string) {
    const issueKey = payload.issue?.key;
    const summary = payload.issue?.fields?.summary ?? "";
    const commentBody = payload.comment?.body ?? "";

    if (summary.startsWith("[Sentinel]") || commentBody.startsWith("[Sentinel]")) {
      return { skipped: true, reason: "echo_prevention" };
    }

    const externalRef = `jira:${issueKey}`;
    const item = await this.db.remediationItem.findFirst({ where: { orgId, externalRef } });
    if (!item) return { skipped: true, reason: "no_matching_item" };

    const jiraStatus = payload.issue?.fields?.status?.name;
    const newStatus = JIRA_STATUS_MAP[jiraStatus];
    if (!newStatus || newStatus === item.status) return { skipped: true, reason: "no_status_change" };

    await this.db.remediationItem.update({
      where: { id: item.id },
      data: { status: newStatus, ...(newStatus === "completed" ? { completedAt: new Date() } : {}) },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${item.id}-sync`,
      orgId,
      topic: "remediation.synced",
      payload: { remediationId: item.id, source: "jira", externalRef, newStatus },
      timestamp: new Date().toISOString(),
    });

    return { skipped: false, itemId: item.id, newStatus };
  }

  async handleGitHubWebhook(payload: any, orgId: string) {
    const repo = payload.repository?.full_name;
    const issueNumber = payload.issue?.number;
    const externalRef = `github:${repo}#${issueNumber}`;

    const item = await this.db.remediationItem.findFirst({ where: { orgId, externalRef } });
    if (!item) return { skipped: true, reason: "no_matching_item" };

    const newStatus = GITHUB_STATE_MAP[payload.issue?.state];
    if (!newStatus || newStatus === item.status) return { skipped: true, reason: "no_status_change" };

    await this.db.remediationItem.update({
      where: { id: item.id },
      data: { status: newStatus, ...(newStatus === "completed" ? { completedAt: new Date() } : {}) },
    });

    await this.eventBus.publish("sentinel.notifications", {
      id: `evt-${item.id}-sync`,
      orgId,
      topic: "remediation.synced",
      payload: { remediationId: item.id, source: "github", externalRef, newStatus },
      timestamp: new Date().toISOString(),
    });

    return { skipped: false, itemId: item.id, newStatus };
  }
}
