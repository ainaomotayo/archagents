import type { EventBus } from "@sentinel/events";

// ---------------------------------------------------------------------------
// External client interfaces — injected so callers can swap real / stub impls
// ---------------------------------------------------------------------------

export interface JiraClient {
  createIssue(config: any, item: any): Promise<{ key: string; url: string }>;
  transitionIssue(config: any, key: string, status: string): Promise<void>;
  addComment(config: any, key: string, comment: string): Promise<void>;
}

export interface GitHubIssueClient {
  createIssue(config: any, item: any): Promise<{ number: number; url: string }>;
  closeIssue(config: any, number: number): Promise<void>;
  addComment(config: any, number: number, comment: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Logger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

interface PrismaClient {
  integrationConfig: {
    findMany(args: any): Promise<any[]>;
  };
  remediationItem: {
    findUnique(args: any): Promise<any | null>;
    update(args: any): Promise<any>;
  };
}

interface RemediationEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface WorkerDeps {
  eventBus: EventBus;
  db: PrismaClient;
  logger: Logger;
  jiraClient?: JiraClient;
  githubClient?: GitHubIssueClient;
}

// ---------------------------------------------------------------------------
// Status mapping: internal status -> Jira transition name
// ---------------------------------------------------------------------------

const STATUS_TO_JIRA_TRANSITION: Record<string, string> = {
  in_progress: "In Progress",
  in_review: "In Review",
  completed: "Done",
  accepted_risk: "Done",
};

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff with 3 attempts (1s / 4s / 16s)
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;
const BACKOFF_FACTOR = 4;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  logger: Logger,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        const delay = BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1);
        logger.warn(
          { attempt, delay, label, error: String(err) },
          "Retrying after failure",
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export function startRemediationIntegrationWorker(deps: WorkerDeps): void {
  const { eventBus, db, logger, jiraClient, githubClient } = deps;
  const consumer = `remediation-integration-${process.pid}`;

  // Fire-and-forget — the subscribe loop runs until disconnect.
  void eventBus.subscribe(
    "sentinel.notifications",
    "remediation-integration",
    consumer,
    async (_id: string, raw: Record<string, unknown>) => {
      const event = raw as unknown as RemediationEvent;
      const { topic, orgId, payload } = event;

      // Only handle remediation.* topics
      if (!topic || !topic.startsWith("remediation.")) {
        return;
      }

      logger.info({ topic, orgId, eventId: event.id }, "Processing remediation integration event");

      // Fetch integration configs for this org
      let configs: any[];
      try {
        configs = await db.integrationConfig.findMany({
          where: { orgId, enabled: true },
        });
      } catch (err) {
        logger.error(
          { orgId, error: String(err) },
          "Failed to fetch integration configs — skipping event",
        );
        return;
      }

      if (!configs || configs.length === 0) {
        // No integrations configured — skip silently
        return;
      }

      const remediationId = payload.remediationId as string | undefined;
      if (!remediationId) {
        logger.warn({ topic, orgId }, "Event missing remediationId in payload — skipping");
        return;
      }

      for (const config of configs) {
        try {
          if (config.provider === "jira" && jiraClient) {
            await handleJiraIntegration(topic, config, remediationId, payload, db, jiraClient, logger);
          } else if (config.provider === "github" && githubClient) {
            await handleGitHubIntegration(topic, config, remediationId, payload, db, githubClient, logger);
          }
        } catch (err) {
          // DLQ: log the error and continue processing other configs / events
          logger.error(
            {
              provider: config.provider,
              configId: config.id,
              orgId,
              remediationId,
              topic,
              error: err instanceof Error ? err.message : String(err),
            },
            "Remediation integration failed after retries — sending to DLQ",
          );
        }
      }
    },
  );

  logger.info({}, "Remediation integration worker started");
}

// ---------------------------------------------------------------------------
// Jira integration handler
// ---------------------------------------------------------------------------

async function handleJiraIntegration(
  topic: string,
  config: any,
  remediationId: string,
  payload: Record<string, unknown>,
  db: PrismaClient,
  client: JiraClient,
  logger: Logger,
): Promise<void> {
  switch (topic) {
    case "remediation.created":
    case "remediation.linked": {
      const item = await db.remediationItem.findUnique({
        where: { id: remediationId },
      });
      if (!item) {
        logger.warn({ remediationId }, "Remediation item not found — skipping Jira create");
        return;
      }

      const result = await withRetry(
        () => client.createIssue(config, item),
        `jira.createIssue(${remediationId})`,
        logger,
      );

      // Store external reference back on the remediation item
      await db.remediationItem.update({
        where: { id: remediationId },
        data: { externalRef: `jira:${result.key}` },
      });

      logger.info(
        { remediationId, jiraKey: result.key, url: result.url },
        "Created Jira issue for remediation item",
      );
      break;
    }

    case "remediation.updated":
    case "remediation.completed": {
      const item = await db.remediationItem.findUnique({
        where: { id: remediationId },
      });
      if (!item?.externalRef?.startsWith("jira:")) {
        return; // No linked Jira issue
      }

      const jiraKey = item.externalRef.replace("jira:", "");
      const status = (payload.status as string) ?? item.status;
      const transition = STATUS_TO_JIRA_TRANSITION[status];

      if (transition) {
        await withRetry(
          () => client.transitionIssue(config, jiraKey, transition),
          `jira.transitionIssue(${jiraKey}, ${transition})`,
          logger,
        );
        logger.info({ remediationId, jiraKey, transition }, "Transitioned Jira issue");
      }

      // Add a status-change comment
      const comment = `[Sentinel] Status changed to "${status}"`;
      await withRetry(
        () => client.addComment(config, jiraKey, comment),
        `jira.addComment(${jiraKey})`,
        logger,
      );
      break;
    }

    default:
      // Unhandled remediation sub-topic — ignore
      break;
  }
}

// ---------------------------------------------------------------------------
// GitHub integration handler
// ---------------------------------------------------------------------------

async function handleGitHubIntegration(
  topic: string,
  config: any,
  remediationId: string,
  payload: Record<string, unknown>,
  db: PrismaClient,
  client: GitHubIssueClient,
  logger: Logger,
): Promise<void> {
  switch (topic) {
    case "remediation.created":
    case "remediation.linked": {
      const item = await db.remediationItem.findUnique({
        where: { id: remediationId },
      });
      if (!item) {
        logger.warn({ remediationId }, "Remediation item not found — skipping GitHub create");
        return;
      }

      const result = await withRetry(
        () => client.createIssue(config, item),
        `github.createIssue(${remediationId})`,
        logger,
      );

      await db.remediationItem.update({
        where: { id: remediationId },
        data: { externalRef: `github:${config.repo ?? "unknown"}#${result.number}` },
      });

      logger.info(
        { remediationId, issueNumber: result.number, url: result.url },
        "Created GitHub issue for remediation item",
      );
      break;
    }

    case "remediation.updated":
    case "remediation.completed": {
      const item = await db.remediationItem.findUnique({
        where: { id: remediationId },
      });
      if (!item?.externalRef?.startsWith("github:")) {
        return; // No linked GitHub issue
      }

      // Parse "github:owner/repo#123"
      const match = item.externalRef.match(/#(\d+)$/);
      if (!match) return;
      const issueNumber = parseInt(match[1], 10);

      const status = (payload.status as string) ?? item.status;

      if (status === "completed" || status === "accepted_risk") {
        await withRetry(
          () => client.closeIssue(config, issueNumber),
          `github.closeIssue(#${issueNumber})`,
          logger,
        );
        logger.info({ remediationId, issueNumber }, "Closed GitHub issue");
      }

      const comment = `[Sentinel] Status changed to "${status}"`;
      await withRetry(
        () => client.addComment(config, issueNumber, comment),
        `github.addComment(#${issueNumber})`,
        logger,
      );
      break;
    }

    default:
      break;
  }
}
