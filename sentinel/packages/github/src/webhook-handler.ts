/**
 * Webhook handler for GitHub push and pull_request events.
 *
 * Parses incoming webhook payloads and converts them into ScanTrigger
 * objects that can be fed into the SENTINEL scan pipeline.
 */

// ── Webhook payload shape (subset of GitHub's full schema) ──

export interface WebhookEvent {
  action?: string;
  installation: { id: number };
  repository: { full_name: string; owner: { login: string } };
  // push-specific fields
  ref?: string;
  deleted?: boolean;
  head_commit?: { id: string; message: string; author: { email: string } };
  // pull_request-specific fields
  pull_request?: {
    number: number;
    head: { sha: string; ref: string };
    user: { login: string };
  };
}

// ── Output type ──

export interface ScanTrigger {
  type: "push" | "pull_request";
  installationId: number;
  repo: string;
  owner: string;
  commitHash: string;
  branch: string;
  author: string;
  prNumber?: number;
}

// ── PR actions we care about ──

const RELEVANT_PR_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
]);

// ── Parser ──

/**
 * Parse a GitHub webhook event into a ScanTrigger, or return `null` if the
 * event is irrelevant (e.g. PR closed, branch deletion, missing data).
 */
export function parseWebhookEvent(
  eventType: string,
  payload: WebhookEvent,
): ScanTrigger | null {
  if (eventType === "push") {
    return parsePushEvent(payload);
  }

  if (eventType === "pull_request") {
    return parsePullRequestEvent(payload);
  }

  // Unknown / unsupported event type
  return null;
}

// ── Helpers ──

function parsePushEvent(payload: WebhookEvent): ScanTrigger | null {
  // Ignore branch/tag deletions
  if (payload.deleted) {
    return null;
  }

  const headCommit = payload.head_commit;
  if (!headCommit) {
    return null;
  }

  const ref = payload.ref;
  if (!ref) {
    return null;
  }

  // Extract branch name from refs/heads/...
  const branch = ref.replace(/^refs\/heads\//, "");

  return {
    type: "push",
    installationId: payload.installation.id,
    repo: payload.repository.full_name,
    owner: payload.repository.owner.login,
    commitHash: headCommit.id,
    branch,
    author: headCommit.author.email,
  };
}

function parsePullRequestEvent(payload: WebhookEvent): ScanTrigger | null {
  const action = payload.action;
  if (!action || !RELEVANT_PR_ACTIONS.has(action)) {
    return null;
  }

  const pr = payload.pull_request;
  if (!pr) {
    return null;
  }

  return {
    type: "pull_request",
    installationId: payload.installation.id,
    repo: payload.repository.full_name,
    owner: payload.repository.owner.login,
    commitHash: pr.head.sha,
    branch: pr.head.ref,
    author: pr.user.login,
    prNumber: pr.number,
  };
}
