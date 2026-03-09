import { describe, it, expect } from "vitest";
import { parseWebhookEvent, type WebhookEvent } from "./webhook-handler.js";

// ── Fixtures ──

function basePushPayload(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    installation: { id: 12345 },
    repository: {
      full_name: "acme/widget",
      owner: { login: "acme" },
    },
    ref: "refs/heads/main",
    head_commit: {
      id: "abc123def456",
      message: "fix: patch vulnerability",
      author: { email: "dev@acme.com" },
    },
    ...overrides,
  };
}

function basePRPayload(
  action: string,
  overrides: Partial<WebhookEvent> = {},
): WebhookEvent {
  return {
    action,
    installation: { id: 67890 },
    repository: {
      full_name: "acme/widget",
      owner: { login: "acme" },
    },
    pull_request: {
      number: 42,
      head: { sha: "pr-sha-789", ref: "feature/cool" },
      user: { login: "contributor" },
    },
    ...overrides,
  };
}

// ── Tests ──

describe("parseWebhookEvent", () => {
  // Push events

  it("parses a push event correctly", () => {
    const trigger = parseWebhookEvent("push", basePushPayload());

    expect(trigger).not.toBeNull();
    expect(trigger!.type).toBe("push");
    expect(trigger!.installationId).toBe(12345);
    expect(trigger!.repo).toBe("acme/widget");
    expect(trigger!.owner).toBe("acme");
    expect(trigger!.commitHash).toBe("abc123def456");
    expect(trigger!.branch).toBe("main");
    expect(trigger!.author).toBe("dev@acme.com");
    expect(trigger!.prNumber).toBeUndefined();
  });

  it("strips refs/heads/ prefix from branch name", () => {
    const trigger = parseWebhookEvent(
      "push",
      basePushPayload({ ref: "refs/heads/feature/deep/branch" }),
    );
    expect(trigger!.branch).toBe("feature/deep/branch");
  });

  it("ignores branch deletion pushes", () => {
    const trigger = parseWebhookEvent(
      "push",
      basePushPayload({ deleted: true }),
    );
    expect(trigger).toBeNull();
  });

  it("returns null when head_commit is missing on push", () => {
    const trigger = parseWebhookEvent(
      "push",
      basePushPayload({ head_commit: undefined }),
    );
    expect(trigger).toBeNull();
  });

  it("returns null when ref is missing on push", () => {
    const trigger = parseWebhookEvent(
      "push",
      basePushPayload({ ref: undefined }),
    );
    expect(trigger).toBeNull();
  });

  // Pull request events

  it("parses an opened PR event", () => {
    const trigger = parseWebhookEvent("pull_request", basePRPayload("opened"));

    expect(trigger).not.toBeNull();
    expect(trigger!.type).toBe("pull_request");
    expect(trigger!.installationId).toBe(67890);
    expect(trigger!.repo).toBe("acme/widget");
    expect(trigger!.owner).toBe("acme");
    expect(trigger!.commitHash).toBe("pr-sha-789");
    expect(trigger!.branch).toBe("feature/cool");
    expect(trigger!.author).toBe("contributor");
    expect(trigger!.prNumber).toBe(42);
  });

  it("parses a synchronize PR event", () => {
    const trigger = parseWebhookEvent(
      "pull_request",
      basePRPayload("synchronize"),
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.type).toBe("pull_request");
  });

  it("parses a reopened PR event", () => {
    const trigger = parseWebhookEvent(
      "pull_request",
      basePRPayload("reopened"),
    );
    expect(trigger).not.toBeNull();
  });

  it("ignores a closed PR event", () => {
    const trigger = parseWebhookEvent(
      "pull_request",
      basePRPayload("closed"),
    );
    expect(trigger).toBeNull();
  });

  it("ignores PR events with unsupported actions", () => {
    expect(
      parseWebhookEvent("pull_request", basePRPayload("labeled")),
    ).toBeNull();
    expect(
      parseWebhookEvent("pull_request", basePRPayload("edited")),
    ).toBeNull();
  });

  it("returns null when pull_request field is missing", () => {
    const trigger = parseWebhookEvent(
      "pull_request",
      basePRPayload("opened", { pull_request: undefined }),
    );
    expect(trigger).toBeNull();
  });

  // Unsupported event types

  it("returns null for unknown event types", () => {
    expect(
      parseWebhookEvent("issues", basePushPayload()),
    ).toBeNull();
    expect(
      parseWebhookEvent("release", basePushPayload()),
    ).toBeNull();
  });
});
