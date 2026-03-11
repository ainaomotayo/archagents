# P7: Webhooks, Notifications & Real-Time Event Streaming — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bridge SENTINEL's internal event system to the outside world — webhook callbacks, Slack/email/PagerDuty notifications, and SSE streaming to the dashboard when scans complete, findings appear, or compliance scores change.

**Architecture:** Hybrid Event Gateway. SSE in-process in the API server. Async notification-worker for reliable webhook/Slack/email/PagerDuty delivery with DB-backed retry. Shared `@sentinel/notifications` package for event types, topic matching trie, and channel adapters.

**Tech Stack:** `@sentinel/notifications` package (new), native `fetch()` for HTTP/Slack/PagerDuty, `nodemailer` for SMTP, Redis pub/sub for SSE fan-out, Redis Streams for guaranteed webhook delivery, PostgreSQL for delivery log and retry queue.

**Reference design:** `sentinel/docs/plans/2026-03-10-p7-webhooks-notifications-design.md`

---

## Task 1: Create `@sentinel/notifications` Package Scaffold

**Files:**
- Create: `packages/notifications/package.json`
- Create: `packages/notifications/tsconfig.json`
- Create: `packages/notifications/src/index.ts`
- Create: `packages/notifications/src/types.ts`

**Step 1: Create package.json**

```json
{
  "name": "@sentinel/notifications",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "echo 'lint placeholder'"
  },
  "dependencies": {
    "nodemailer": "^6.9"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/nodemailer": "^6.4",
    "typescript": "^5.7",
    "vitest": "^3.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/__tests__/**"]
}
```

**Step 3: Create types.ts**

```typescript
// --- Event Types ---

export interface NotificationEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type ChannelType = "http" | "slack" | "email" | "pagerduty";

// --- Webhook Endpoint (mirrors Prisma model) ---

export interface WebhookEndpointConfig {
  id: string;
  orgId: string;
  name: string;
  url: string;
  channelType: ChannelType;
  secret: string;
  topics: string[];
  headers: Record<string, string>;
  enabled: boolean;
}

// --- Notification Rule (mirrors Prisma model) ---

export interface NotificationRuleConfig {
  id: string;
  orgId: string;
  name: string;
  topics: string[];
  condition: Record<string, unknown> | null;
  channelType: ChannelType;
  channelConfig: Record<string, unknown>;
  enabled: boolean;
}

// --- Channel Adapter Interface ---

export interface DeliveryResult {
  success: boolean;
  httpStatus?: number;
  error?: string;
  durationMs: number;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  deliver(
    endpoint: WebhookEndpointConfig | NotificationRuleConfig,
    event: NotificationEvent,
  ): Promise<DeliveryResult>;
}

// --- Delivery Status ---

export type DeliveryStatus = "pending" | "delivered" | "failed" | "dlq";

// --- SSE Client ---

export interface SseClient {
  id: string;
  orgId: string;
  topics: string[];
  write: (data: string) => boolean;
  close: () => void;
}
```

**Step 4: Create index.ts (empty exports for now)**

```typescript
export type {
  NotificationEvent,
  ChannelType,
  WebhookEndpointConfig,
  NotificationRuleConfig,
  DeliveryResult,
  ChannelAdapter,
  DeliveryStatus,
  SseClient,
} from "./types.js";
```

**Step 5: Install dependencies and verify build**

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm install && npx turbo build --filter=@sentinel/notifications`
Expected: Build succeeds, `dist/` created with compiled JS + declarations.

**Step 6: Commit**

```bash
git add packages/notifications/
git commit -m "feat(notifications): scaffold @sentinel/notifications package with types"
```

---

## Task 2: Topic Matching Trie

**Files:**
- Create: `packages/notifications/src/trie.ts`
- Create: `packages/notifications/src/__tests__/trie.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/trie.test.ts
import { describe, it, expect } from "vitest";
import { TopicTrie } from "../trie.js";

describe("TopicTrie", () => {
  it("matches exact topic", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.failed", "ep-2");

    expect(trie.match("scan.completed")).toEqual(["ep-1"]);
    expect(trie.match("scan.failed")).toEqual(["ep-2"]);
  });

  it("matches wildcard at segment level", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.*", "ep-wild");
    trie.add("scan.completed", "ep-exact");

    const matches = trie.match("scan.completed");
    expect(matches).toContain("ep-wild");
    expect(matches).toContain("ep-exact");
  });

  it("matches global wildcard", () => {
    const trie = new TopicTrie<string>();
    trie.add("*", "ep-global");
    trie.add("scan.completed", "ep-exact");

    const matches = trie.match("scan.completed");
    expect(matches).toContain("ep-global");
    expect(matches).toContain("ep-exact");
  });

  it("returns empty array for no matches", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");

    expect(trie.match("finding.created")).toEqual([]);
  });

  it("deduplicates subscribers matched via multiple paths", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.*", "ep-1");

    const matches = trie.match("scan.completed");
    expect(matches).toEqual(["ep-1"]);
  });

  it("handles multi-level topics", () => {
    const trie = new TopicTrie<string>();
    trie.add("compliance.report_ready", "ep-1");
    trie.add("compliance.*", "ep-2");

    expect(trie.match("compliance.report_ready")).toContain("ep-1");
    expect(trie.match("compliance.report_ready")).toContain("ep-2");
    expect(trie.match("compliance.assessed")).toEqual(["ep-2"]);
  });

  it("removes a subscriber from a topic", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("scan.completed", "ep-2");
    trie.remove("scan.completed", "ep-1");

    expect(trie.match("scan.completed")).toEqual(["ep-2"]);
  });

  it("clears all subscribers", () => {
    const trie = new TopicTrie<string>();
    trie.add("scan.completed", "ep-1");
    trie.add("finding.*", "ep-2");
    trie.clear();

    expect(trie.match("scan.completed")).toEqual([]);
    expect(trie.match("finding.created")).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/trie.test.ts`
Expected: FAIL — `TopicTrie` not found.

**Step 3: Implement TopicTrie**

```typescript
// packages/notifications/src/trie.ts

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  subscribers: Set<T>;
}

function createNode<T>(): TrieNode<T> {
  return { children: new Map(), subscribers: new Set() };
}

export class TopicTrie<T> {
  private root: TrieNode<T> = createNode();

  /** Add a subscriber for a topic pattern (supports `*` wildcard segments). */
  add(pattern: string, subscriber: T): void {
    const segments = pattern.split(".");
    let node = this.root;
    for (const seg of segments) {
      if (!node.children.has(seg)) {
        node.children.set(seg, createNode());
      }
      node = node.children.get(seg)!;
    }
    node.subscribers.add(subscriber);
  }

  /** Remove a subscriber from a specific topic pattern. */
  remove(pattern: string, subscriber: T): void {
    const segments = pattern.split(".");
    let node = this.root;
    for (const seg of segments) {
      const child = node.children.get(seg);
      if (!child) return;
      node = child;
    }
    node.subscribers.delete(subscriber);
  }

  /** Match an event topic against all registered patterns. Returns deduplicated subscribers. */
  match(topic: string): T[] {
    const segments = topic.split(".");
    const results = new Set<T>();
    this.walk(this.root, segments, 0, results);
    return [...results];
  }

  /** Clear all subscriptions. */
  clear(): void {
    this.root = createNode();
  }

  private walk(node: TrieNode<T>, segments: string[], depth: number, results: Set<T>): void {
    if (depth === segments.length) {
      for (const sub of node.subscribers) results.add(sub);
      return;
    }

    const seg = segments[depth];

    // Exact match
    const exact = node.children.get(seg);
    if (exact) this.walk(exact, segments, depth + 1, results);

    // Wildcard match — `*` at this level matches any single segment
    const wildcard = node.children.get("*");
    if (wildcard) {
      // If wildcard is terminal (last segment of pattern), collect its subscribers
      // for all remaining segments (since `*` at last position matches rest)
      if (depth === segments.length - 1) {
        for (const sub of wildcard.subscribers) results.add(sub);
      } else {
        this.walk(wildcard, segments, depth + 1, results);
      }
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { TopicTrie } from "./trie.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/trie.test.ts`
Expected: 8 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/trie.ts packages/notifications/src/__tests__/trie.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add TopicTrie for event-to-subscriber matching"
```

---

## Task 3: HTTP Webhook Channel Adapter

**Files:**
- Create: `packages/notifications/src/adapters/http-webhook.ts`
- Create: `packages/notifications/src/__tests__/http-webhook.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/http-webhook.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpWebhookAdapter } from "../adapters/http-webhook.js";
import type { WebhookEndpointConfig, NotificationEvent } from "../types.js";

const endpoint: WebhookEndpointConfig = {
  id: "ep-1",
  orgId: "org-1",
  name: "Test Hook",
  url: "https://example.com/hook",
  channelType: "http",
  secret: "test-secret-key",
  topics: ["scan.completed"],
  headers: { "X-Custom": "value" },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "scan.completed",
  payload: { scanId: "scan-123", riskScore: 42 },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("HttpWebhookAdapter", () => {
  let adapter: HttpWebhookAdapter;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    adapter = new HttpWebhookAdapter(fetchSpy as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with correct payload and HMAC signature", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });

    const result = await adapter.deliver(endpoint, event);

    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(opts.headers["X-Custom"]).toBe("value");
    expect(opts.headers["X-Sentinel-Signature"]).toMatch(/^sha256=[a-f0-9]{64}$/);

    const body = JSON.parse(opts.body);
    expect(body.id).toBe("evt-1");
    expect(body.topic).toBe("scan.completed");
  });

  it("returns failure on non-2xx status", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });

    const result = await adapter.deliver(endpoint, event);

    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(500);
    expect(result.error).toContain("500");
  });

  it("returns failure on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await adapter.deliver(endpoint, event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns failure on timeout via AbortSignal", async () => {
    fetchSpy.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error("AbortError")), 50)),
    );

    const adapter10ms = new HttpWebhookAdapter(fetchSpy as typeof fetch, 50);
    const result = await adapter10ms.deliver(endpoint, event);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("generates valid HMAC-SHA256 signature", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });

    await adapter.deliver(endpoint, event);

    const [, opts] = fetchSpy.mock.calls[0];
    const sig = opts.headers["X-Sentinel-Signature"];
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it("includes custom headers from endpoint config", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });

    await adapter.deliver(endpoint, event);

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers["X-Custom"]).toBe("value");
  });

  it("records delivery duration", async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });

    const result = await adapter.deliver(endpoint, event);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/http-webhook.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement HttpWebhookAdapter**

```typescript
// packages/notifications/src/adapters/http-webhook.ts
import { createHmac } from "node:crypto";
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationEvent,
  WebhookEndpointConfig,
  NotificationRuleConfig,
} from "../types.js";

function sign(payload: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return `sha256=${hmac.digest("hex")}`;
}

export class HttpWebhookAdapter implements ChannelAdapter {
  readonly type = "http" as const;

  constructor(
    private fetchFn: typeof fetch = globalThis.fetch,
    private timeoutMs: number = 10_000,
  ) {}

  async deliver(
    endpoint: WebhookEndpointConfig | NotificationRuleConfig,
    event: NotificationEvent,
  ): Promise<DeliveryResult> {
    const start = performance.now();
    const ep = endpoint as WebhookEndpointConfig;
    const body = JSON.stringify(event);
    const signature = sign(body, ep.secret);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Sentinel-Signature": signature,
      ...(ep.headers ?? {}),
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(ep.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);
      const durationMs = performance.now() - start;

      if (!response.ok) {
        return {
          success: false,
          httpStatus: response.status,
          error: `HTTP ${response.status} ${response.statusText}`,
          durationMs,
        };
      }

      return { success: true, httpStatus: response.status, durationMs };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - start,
      };
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { HttpWebhookAdapter } from "./adapters/http-webhook.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/http-webhook.test.ts`
Expected: 7 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/adapters/http-webhook.ts packages/notifications/src/__tests__/http-webhook.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add HttpWebhookAdapter with HMAC-SHA256 signing"
```

---

## Task 4: Slack Channel Adapter

**Files:**
- Create: `packages/notifications/src/adapters/slack.ts`
- Create: `packages/notifications/src/__tests__/slack.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/slack.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlackAdapter } from "../adapters/slack.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1",
  orgId: "org-1",
  name: "Slack Critical",
  topics: ["finding.critical"],
  condition: null,
  channelType: "slack",
  channelConfig: { webhookUrl: "https://hooks.slack.com/services/T00/B00/xxx" },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "finding.critical",
  payload: { findingId: "f-1", severity: "critical", category: "vulnerability/sql-injection", file: "src/db.ts" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("SlackAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let adapter: SlackAdapter;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    adapter = new SlackAdapter(fetchSpy as typeof fetch);
  });

  it("sends Block Kit formatted message", async () => {
    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/T00/B00/xxx");
    const body = JSON.parse(opts.body);
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBeGreaterThan(0);
  });

  it("uses severity-based color coding", async () => {
    const result = await adapter.deliver(rule, event);
    expect(result.success).toBe(true);

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    // Critical = red attachment color
    const attachment = body.attachments?.[0];
    expect(attachment?.color).toBe("#dc2626");
  });

  it("returns failure on Slack API error", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" });

    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("returns failure on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("includes event details in message fields", async () => {
    await adapter.deliver(rule, event);

    const [, opts] = fetchSpy.mock.calls[0];
    const body = JSON.parse(opts.body);
    const text = JSON.stringify(body);
    expect(text).toContain("finding.critical");
    expect(text).toContain("evt-1");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/slack.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement SlackAdapter**

```typescript
// packages/notifications/src/adapters/slack.ts
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationEvent,
  WebhookEndpointConfig,
  NotificationRuleConfig,
} from "../types.js";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#2563eb",
  info: "#6b7280",
};

function buildSlackPayload(event: NotificationEvent) {
  const severity = (event.payload.severity as string) ?? "info";
  const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;

  const fields = Object.entries(event.payload)
    .slice(0, 8)
    .map(([k, v]) => ({ title: k, value: String(v), short: true }));

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `SENTINEL: ${event.topic}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Event:* \`${event.topic}\`\n*ID:* \`${event.id}\`\n*Time:* ${event.timestamp}`,
        },
      },
    ],
    attachments: [
      {
        color,
        fields,
      },
    ],
  };
}

export class SlackAdapter implements ChannelAdapter {
  readonly type = "slack" as const;

  constructor(
    private fetchFn: typeof fetch = globalThis.fetch,
    private timeoutMs: number = 5_000,
  ) {}

  async deliver(
    endpoint: WebhookEndpointConfig | NotificationRuleConfig,
    event: NotificationEvent,
  ): Promise<DeliveryResult> {
    const start = performance.now();
    const config = (endpoint as NotificationRuleConfig).channelConfig ?? {};
    const webhookUrl = (config as Record<string, string>).webhookUrl ?? (endpoint as WebhookEndpointConfig).url;
    const payload = buildSlackPayload(event);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const durationMs = performance.now() - start;

      if (!response.ok) {
        return {
          success: false,
          httpStatus: response.status,
          error: `Slack API ${response.status} ${response.statusText}`,
          durationMs,
        };
      }

      return { success: true, httpStatus: response.status, durationMs };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - start,
      };
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { SlackAdapter } from "./adapters/slack.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/slack.test.ts`
Expected: 5 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/adapters/slack.ts packages/notifications/src/__tests__/slack.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add SlackAdapter with Block Kit formatting"
```

---

## Task 5: Email Channel Adapter

**Files:**
- Create: `packages/notifications/src/adapters/email.ts`
- Create: `packages/notifications/src/__tests__/email.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/email.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmailAdapter } from "../adapters/email.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1",
  orgId: "org-1",
  name: "Email Alerts",
  topics: ["scan.completed"],
  condition: null,
  channelType: "email",
  channelConfig: {
    to: ["admin@example.com", "dev@example.com"],
    from: "sentinel@example.com",
    subject: "SENTINEL Alert: {{topic}}",
  },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "scan.completed",
  payload: { scanId: "scan-123", riskScore: 42, verdict: "pass" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("EmailAdapter", () => {
  let sendMailSpy: ReturnType<typeof vi.fn>;
  let adapter: EmailAdapter;

  beforeEach(() => {
    sendMailSpy = vi.fn().mockResolvedValue({ messageId: "msg-1" });
    const mockTransport = { sendMail: sendMailSpy };
    adapter = new EmailAdapter(mockTransport as any);
  });

  it("sends email with HTML body", async () => {
    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(true);
    expect(sendMailSpy).toHaveBeenCalledTimes(1);
    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.to).toBe("admin@example.com, dev@example.com");
    expect(mailOpts.from).toBe("sentinel@example.com");
    expect(mailOpts.html).toContain("scan.completed");
  });

  it("substitutes topic in subject line", async () => {
    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(true);
    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.subject).toBe("SENTINEL Alert: scan.completed");
  });

  it("includes payload data in HTML body", async () => {
    await adapter.deliver(rule, event);

    const mailOpts = sendMailSpy.mock.calls[0][0];
    expect(mailOpts.html).toContain("scan-123");
    expect(mailOpts.html).toContain("42");
  });

  it("returns failure on SMTP error", async () => {
    sendMailSpy.mockRejectedValue(new Error("SMTP connection refused"));

    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("SMTP connection refused");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/email.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement EmailAdapter**

```typescript
// packages/notifications/src/adapters/email.ts
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationEvent,
  WebhookEndpointConfig,
  NotificationRuleConfig,
} from "../types.js";

interface Transporter {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

function buildHtml(event: NotificationEvent): string {
  const rows = Object.entries(event.payload)
    .map(([k, v]) => `<tr><td style="padding:4px 8px;font-weight:bold">${k}</td><td style="padding:4px 8px">${String(v)}</td></tr>`)
    .join("\n");

  return `
    <div style="font-family:sans-serif;max-width:600px">
      <h2 style="color:#1e293b">SENTINEL Event: ${event.topic}</h2>
      <p><strong>Event ID:</strong> ${event.id}</p>
      <p><strong>Time:</strong> ${event.timestamp}</p>
      <table style="border-collapse:collapse;width:100%">
        <thead><tr style="background:#f1f5f9"><th style="padding:4px 8px;text-align:left">Field</th><th style="padding:4px 8px;text-align:left">Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `.trim();
}

export class EmailAdapter implements ChannelAdapter {
  readonly type = "email" as const;

  constructor(private transporter: Transporter) {}

  async deliver(
    endpoint: WebhookEndpointConfig | NotificationRuleConfig,
    event: NotificationEvent,
  ): Promise<DeliveryResult> {
    const start = performance.now();
    const config = (endpoint as NotificationRuleConfig).channelConfig as Record<string, unknown> ?? {};
    const to = Array.isArray(config.to) ? (config.to as string[]).join(", ") : String(config.to ?? "");
    const from = String(config.from ?? "sentinel@localhost");
    const subjectTemplate = String(config.subject ?? "SENTINEL: {{topic}}");
    const subject = subjectTemplate.replace("{{topic}}", event.topic);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html: buildHtml(event),
      });

      return { success: true, durationMs: performance.now() - start };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - start,
      };
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { EmailAdapter } from "./adapters/email.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/email.test.ts`
Expected: 4 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/adapters/email.ts packages/notifications/src/__tests__/email.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add EmailAdapter with HTML templates"
```

---

## Task 6: PagerDuty Channel Adapter

**Files:**
- Create: `packages/notifications/src/adapters/pagerduty.ts`
- Create: `packages/notifications/src/__tests__/pagerduty.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/pagerduty.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PagerDutyAdapter } from "../adapters/pagerduty.js";
import type { NotificationEvent, NotificationRuleConfig } from "../types.js";

const rule: NotificationRuleConfig = {
  id: "rule-1",
  orgId: "org-1",
  name: "PD Critical",
  topics: ["finding.critical"],
  condition: null,
  channelType: "pagerduty",
  channelConfig: { routingKey: "R0123456789ABCDEF" },
  enabled: true,
};

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "finding.critical",
  payload: { findingId: "f-1", severity: "critical", category: "vulnerability/rce", file: "src/exec.ts" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("PagerDutyAdapter", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let adapter: PagerDutyAdapter;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    adapter = new PagerDutyAdapter(fetchSpy as typeof fetch);
  });

  it("sends PD Events API v2 payload with routing key", async () => {
    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(true);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    const body = JSON.parse(opts.body);
    expect(body.routing_key).toBe("R0123456789ABCDEF");
    expect(body.event_action).toBe("trigger");
  });

  it("maps SENTINEL severity to PD severity", async () => {
    await adapter.deliver(rule, event);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.payload.severity).toBe("critical");
  });

  it("includes dedup key from event ID", async () => {
    await adapter.deliver(rule, event);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.dedup_key).toBe("sentinel-evt-1");
  });

  it("returns failure on PD API error", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 429, statusText: "Rate Limited" });

    const result = await adapter.deliver(rule, event);

    expect(result.success).toBe(false);
    expect(result.error).toContain("429");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/pagerduty.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement PagerDutyAdapter**

```typescript
// packages/notifications/src/adapters/pagerduty.ts
import type {
  ChannelAdapter,
  DeliveryResult,
  NotificationEvent,
  WebhookEndpointConfig,
  NotificationRuleConfig,
} from "../types.js";

const PD_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";

const SEVERITY_MAP: Record<string, string> = {
  critical: "critical",
  high: "error",
  medium: "warning",
  low: "info",
  info: "info",
};

export class PagerDutyAdapter implements ChannelAdapter {
  readonly type = "pagerduty" as const;

  constructor(
    private fetchFn: typeof fetch = globalThis.fetch,
    private timeoutMs: number = 10_000,
  ) {}

  async deliver(
    endpoint: WebhookEndpointConfig | NotificationRuleConfig,
    event: NotificationEvent,
  ): Promise<DeliveryResult> {
    const start = performance.now();
    const config = (endpoint as NotificationRuleConfig).channelConfig as Record<string, string> ?? {};
    const routingKey = config.routingKey ?? "";
    const severity = (event.payload.severity as string) ?? "info";

    const body = {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: `sentinel-${event.id}`,
      payload: {
        summary: `SENTINEL ${event.topic}: ${JSON.stringify(event.payload).slice(0, 200)}`,
        source: "sentinel",
        severity: SEVERITY_MAP[severity] ?? "info",
        timestamp: event.timestamp,
        custom_details: event.payload,
      },
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await this.fetchFn(PD_EVENTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const durationMs = performance.now() - start;

      if (!response.ok) {
        return {
          success: false,
          httpStatus: response.status,
          error: `PagerDuty API ${response.status} ${response.statusText}`,
          durationMs,
        };
      }

      return { success: true, httpStatus: response.status, durationMs };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: performance.now() - start,
      };
    }
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { PagerDutyAdapter } from "./adapters/pagerduty.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/pagerduty.test.ts`
Expected: 4 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/adapters/pagerduty.ts packages/notifications/src/__tests__/pagerduty.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add PagerDutyAdapter with Events API v2"
```

---

## Task 7: Channel Adapter Registry

**Files:**
- Create: `packages/notifications/src/registry.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Implement the adapter registry (simple enough to skip test-first)**

```typescript
// packages/notifications/src/registry.ts
import type { ChannelAdapter, ChannelType } from "./types.js";

export class AdapterRegistry {
  private adapters = new Map<ChannelType, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  get(type: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  has(type: ChannelType): boolean {
    return this.adapters.has(type);
  }
}
```

**Step 2: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { AdapterRegistry } from "./registry.js";
```

**Step 3: Build to verify**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo build --filter=@sentinel/notifications`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/notifications/src/registry.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add AdapterRegistry for O(1) channel dispatch"
```

---

## Task 8: SSE Manager

**Files:**
- Create: `packages/notifications/src/sse-manager.ts`
- Create: `packages/notifications/src/__tests__/sse-manager.test.ts`
- Modify: `packages/notifications/src/index.ts`

**Step 1: Write the failing tests**

```typescript
// packages/notifications/src/__tests__/sse-manager.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SseManager } from "../sse-manager.js";
import type { SseClient, NotificationEvent } from "../types.js";

function mockClient(overrides: Partial<SseClient> = {}): SseClient {
  return {
    id: `client-${Math.random().toString(36).slice(2, 8)}`,
    orgId: "org-1",
    topics: ["scan.*"],
    write: vi.fn().mockReturnValue(true),
    close: vi.fn(),
    ...overrides,
  };
}

const event: NotificationEvent = {
  id: "evt-1",
  orgId: "org-1",
  topic: "scan.completed",
  payload: { scanId: "scan-123" },
  timestamp: "2026-03-10T12:00:00Z",
};

describe("SseManager", () => {
  let manager: SseManager;

  beforeEach(() => {
    manager = new SseManager();
  });

  it("registers client and broadcasts matching events", () => {
    const client = mockClient();
    manager.register(client);

    manager.broadcast(event);

    expect(client.write).toHaveBeenCalledTimes(1);
    const written = (client.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(written).toContain("event: scan.completed");
    expect(written).toContain('"scanId":"scan-123"');
  });

  it("does not send to clients with non-matching topics", () => {
    const client = mockClient({ topics: ["finding.*"] });
    manager.register(client);

    manager.broadcast(event);

    expect(client.write).not.toHaveBeenCalled();
  });

  it("isolates events by orgId", () => {
    const client1 = mockClient({ orgId: "org-1" });
    const client2 = mockClient({ orgId: "org-2" });
    manager.register(client1);
    manager.register(client2);

    manager.broadcast(event); // orgId: org-1

    expect(client1.write).toHaveBeenCalled();
    expect(client2.write).not.toHaveBeenCalled();
  });

  it("removes disconnected clients", () => {
    const client = mockClient();
    manager.register(client);
    manager.unregister(client.id, client.orgId);

    manager.broadcast(event);

    expect(client.write).not.toHaveBeenCalled();
  });

  it("returns connection count per org", () => {
    manager.register(mockClient({ orgId: "org-1" }));
    manager.register(mockClient({ orgId: "org-1" }));
    manager.register(mockClient({ orgId: "org-2" }));

    expect(manager.connectionCount("org-1")).toBe(2);
    expect(manager.connectionCount("org-2")).toBe(1);
    expect(manager.connectionCount("org-3")).toBe(0);
  });

  it("cleans up clients that fail to write", () => {
    const client = mockClient();
    (client.write as ReturnType<typeof vi.fn>).mockReturnValue(false);
    manager.register(client);

    manager.broadcast(event);

    // Client should be removed after failed write
    expect(manager.connectionCount("org-1")).toBe(0);
    expect(client.close).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/sse-manager.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement SseManager**

```typescript
// packages/notifications/src/sse-manager.ts
import { TopicTrie } from "./trie.js";
import type { SseClient, NotificationEvent } from "./types.js";

interface OrgBucket {
  clients: Map<string, SseClient>;
  trie: TopicTrie<string>; // stores client IDs
}

export class SseManager {
  private orgs = new Map<string, OrgBucket>();

  register(client: SseClient): void {
    let bucket = this.orgs.get(client.orgId);
    if (!bucket) {
      bucket = { clients: new Map(), trie: new TopicTrie() };
      this.orgs.set(client.orgId, bucket);
    }
    bucket.clients.set(client.id, client);
    for (const topic of client.topics) {
      bucket.trie.add(topic, client.id);
    }
  }

  unregister(clientId: string, orgId: string): void {
    const bucket = this.orgs.get(orgId);
    if (!bucket) return;
    const client = bucket.clients.get(clientId);
    if (!client) return;
    bucket.clients.delete(clientId);
    for (const topic of client.topics) {
      bucket.trie.remove(topic, clientId);
    }
    if (bucket.clients.size === 0) {
      this.orgs.delete(orgId);
    }
  }

  broadcast(event: NotificationEvent): void {
    const bucket = this.orgs.get(event.orgId);
    if (!bucket) return;

    const matchedIds = bucket.trie.match(event.topic);
    const ssePayload = `event: ${event.topic}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;

    for (const clientId of matchedIds) {
      const client = bucket.clients.get(clientId);
      if (!client) continue;
      const ok = client.write(ssePayload);
      if (!ok) {
        client.close();
        this.unregister(clientId, event.orgId);
      }
    }
  }

  connectionCount(orgId: string): number {
    return this.orgs.get(orgId)?.clients.size ?? 0;
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/notifications/src/index.ts`:

```typescript
export { SseManager } from "./sse-manager.js";
```

**Step 5: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run src/__tests__/sse-manager.test.ts`
Expected: 6 tests PASS.

**Step 6: Commit**

```bash
git add packages/notifications/src/sse-manager.ts packages/notifications/src/__tests__/sse-manager.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add SseManager with org-isolated topic-based broadcasting"
```

---

## Task 9: Prisma Schema — 3 New Models

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add models to end of schema.prisma**

Append after the `Report` model (after line ~330):

```prisma
// --- P7: Webhooks & Notifications ---

model WebhookEndpoint {
  id          String   @id @default(uuid()) @db.Uuid
  orgId       String   @map("org_id") @db.Uuid
  name        String
  url         String
  channelType String   @map("channel_type")
  secret      String
  topics      String[]
  headers     Json     @default("{}")
  enabled     Boolean  @default(true)
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at")

  deliveries WebhookDelivery[]

  @@index([orgId, enabled])
  @@map("webhook_endpoints")
}

model WebhookDelivery {
  id          String    @id @default(uuid()) @db.Uuid
  endpointId  String    @map("endpoint_id") @db.Uuid
  orgId       String    @map("org_id") @db.Uuid
  topic       String
  payload     Json
  status      String    @default("pending")
  httpStatus  Int?      @map("http_status")
  attempt     Int       @default(1)
  maxAttempts Int       @default(5) @map("max_attempts")
  nextRetryAt DateTime? @map("next_retry_at")
  lastError   String?   @map("last_error")
  deliveredAt DateTime? @map("delivered_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  endpoint WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)

  @@index([status, nextRetryAt])
  @@index([orgId, createdAt(sort: Desc)])
  @@index([endpointId, createdAt(sort: Desc)])
  @@map("webhook_deliveries")
}

model NotificationRule {
  id            String   @id @default(uuid()) @db.Uuid
  orgId         String   @map("org_id") @db.Uuid
  name          String
  topics        String[]
  condition     Json?
  channelType   String   @map("channel_type")
  channelConfig Json     @default("{}") @map("channel_config")
  enabled       Boolean  @default(true)
  createdBy     String?  @map("created_by")
  createdAt     DateTime @default(now()) @map("created_at")

  @@index([orgId, enabled])
  @@map("notification_rules")
}
```

**Step 2: Generate Prisma client**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx prisma generate --schema=packages/db/prisma/schema.prisma`
Expected: Prisma Client generated successfully.

**Step 3: Create migration**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx prisma migrate dev --schema=packages/db/prisma/schema.prisma --name add_webhook_notification_models`
Expected: Migration created and applied. If DB is not running, use `npx prisma migrate dev --create-only` instead.

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add WebhookEndpoint, WebhookDelivery, NotificationRule models"
```

---

## Task 10: RBAC Permissions for Webhook & Notification Routes

**Files:**
- Modify: `packages/security/src/rbac.ts`
- Modify: `apps/api/src/__tests__/rbac-enforcement.test.ts`

**Step 1: Write the failing tests**

Add to `apps/api/src/__tests__/rbac-enforcement.test.ts`:

```typescript
// Add to existing describe block
it("only admin can create/update/delete webhooks", () => {
  expect(isAuthorized("admin", "POST", "/v1/webhooks")).toBe(true);
  expect(isAuthorized("admin", "PUT", "/v1/webhooks/:id")).toBe(true);
  expect(isAuthorized("admin", "DELETE", "/v1/webhooks/:id")).toBe(true);
  expect(isAuthorized("manager", "POST", "/v1/webhooks")).toBe(false);
  expect(isAuthorized("developer", "POST", "/v1/webhooks")).toBe(false);
});

it("admin and manager can list webhooks and deliveries", () => {
  expect(isAuthorized("admin", "GET", "/v1/webhooks")).toBe(true);
  expect(isAuthorized("manager", "GET", "/v1/webhooks")).toBe(true);
  expect(isAuthorized("admin", "GET", "/v1/webhooks/:id")).toBe(true);
  expect(isAuthorized("manager", "GET", "/v1/webhooks/:id")).toBe(true);
  expect(isAuthorized("admin", "GET", "/v1/webhooks/:id/deliveries")).toBe(true);
  expect(isAuthorized("developer", "GET", "/v1/webhooks")).toBe(false);
});

it("admin can test webhook endpoints", () => {
  expect(isAuthorized("admin", "POST", "/v1/webhooks/:id/test")).toBe(true);
  expect(isAuthorized("manager", "POST", "/v1/webhooks/:id/test")).toBe(false);
});

it("admin and manager can manage notification rules", () => {
  expect(isAuthorized("admin", "POST", "/v1/notifications/rules")).toBe(true);
  expect(isAuthorized("manager", "POST", "/v1/notifications/rules")).toBe(true);
  expect(isAuthorized("admin", "GET", "/v1/notifications/rules")).toBe(true);
  expect(isAuthorized("admin", "DELETE", "/v1/notifications/rules/:id")).toBe(true);
  expect(isAuthorized("developer", "POST", "/v1/notifications/rules")).toBe(false);
});

it("all authenticated users can access SSE stream", () => {
  expect(isAuthorized("admin", "GET", "/v1/events/stream")).toBe(true);
  expect(isAuthorized("manager", "GET", "/v1/events/stream")).toBe(true);
  expect(isAuthorized("developer", "GET", "/v1/events/stream")).toBe(true);
  expect(isAuthorized("viewer", "GET", "/v1/events/stream")).toBe(true);
  expect(isAuthorized("service", "GET", "/v1/events/stream")).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/__tests__/rbac-enforcement.test.ts`
Expected: FAIL — new assertions fail.

**Step 3: Add permissions to rbac.ts**

Add to the `API_PERMISSIONS` array in `packages/security/src/rbac.ts`:

```typescript
// Webhooks
{ method: "POST", path: "/v1/webhooks", roles: ["admin"] },
{ method: "GET", path: "/v1/webhooks", roles: ["admin", "manager"] },
{ method: "GET", path: "/v1/webhooks/:id", roles: ["admin", "manager"] },
{ method: "PUT", path: "/v1/webhooks/:id", roles: ["admin"] },
{ method: "DELETE", path: "/v1/webhooks/:id", roles: ["admin"] },
{ method: "POST", path: "/v1/webhooks/:id/test", roles: ["admin"] },
{ method: "GET", path: "/v1/webhooks/:id/deliveries", roles: ["admin", "manager"] },
// Notification rules
{ method: "POST", path: "/v1/notifications/rules", roles: ["admin", "manager"] },
{ method: "GET", path: "/v1/notifications/rules", roles: ["admin", "manager"] },
{ method: "DELETE", path: "/v1/notifications/rules/:id", roles: ["admin", "manager"] },
// SSE stream
{ method: "GET", path: "/v1/events/stream", roles: ["admin", "manager", "developer", "viewer", "service"] },
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/__tests__/rbac-enforcement.test.ts`
Expected: All RBAC tests PASS.

**Step 5: Commit**

```bash
git add packages/security/src/rbac.ts apps/api/src/__tests__/rbac-enforcement.test.ts
git commit -m "feat(security): add RBAC permissions for webhook, notification, and SSE routes"
```

---

## Task 11: Webhook CRUD API Routes

**Files:**
- Create: `apps/api/src/routes/notification-endpoints.ts`
- Create: `apps/api/src/routes/notification-endpoints.test.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/package.json`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/routes/notification-endpoints.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildWebhookRoutes } from "./notification-endpoints.js";

function makeDeps() {
  const db = {
    webhookEndpoint: {
      create: vi.fn().mockResolvedValue({
        id: "ep-1", orgId: "org-1", name: "Test", url: "https://example.com/hook",
        channelType: "http", secret: "generated-secret", topics: ["scan.completed"],
        headers: {}, enabled: true, createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "ep-1", name: "Test", channelType: "http", topics: ["scan.completed"], enabled: true },
      ]),
      findUnique: vi.fn().mockResolvedValue({
        id: "ep-1", orgId: "org-1", name: "Test", url: "https://example.com/hook",
        channelType: "http", secret: "secret", topics: ["scan.completed"], headers: {}, enabled: true,
      }),
      update: vi.fn().mockResolvedValue({ id: "ep-1", name: "Updated" }),
      delete: vi.fn().mockResolvedValue({ id: "ep-1" }),
      count: vi.fn().mockResolvedValue(1),
    },
    webhookDelivery: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return { db };
}

describe("buildWebhookRoutes", () => {
  it("createEndpoint generates a secret and stores endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    const result = await routes.createEndpoint({
      orgId: "org-1",
      body: { name: "Test", url: "https://example.com/hook", channelType: "http", topics: ["scan.completed"] },
      createdBy: "admin",
    });

    expect(db.webhookEndpoint.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        name: "Test",
        url: "https://example.com/hook",
        channelType: "http",
        topics: ["scan.completed"],
        secret: expect.stringMatching(/^whsec_/),
      }),
    });
    expect(result.id).toBe("ep-1");
  });

  it("listEndpoints returns paginated results", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    const result = await routes.listEndpoints({ orgId: "org-1", limit: 50, offset: 0 });

    expect(db.webhookEndpoint.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("getEndpoint returns single endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    const result = await routes.getEndpoint("ep-1");

    expect(db.webhookEndpoint.findUnique).toHaveBeenCalledWith({ where: { id: "ep-1" } });
    expect(result?.id).toBe("ep-1");
  });

  it("updateEndpoint modifies endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    const result = await routes.updateEndpoint("ep-1", { name: "Updated" });

    expect(db.webhookEndpoint.update).toHaveBeenCalledWith({
      where: { id: "ep-1" },
      data: expect.objectContaining({ name: "Updated" }),
    });
    expect(result.name).toBe("Updated");
  });

  it("deleteEndpoint removes endpoint", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    await routes.deleteEndpoint("ep-1");

    expect(db.webhookEndpoint.delete).toHaveBeenCalledWith({ where: { id: "ep-1" } });
  });

  it("getDeliveries returns paginated delivery log", async () => {
    const { db } = makeDeps();
    const routes = buildWebhookRoutes({ db: db as any });

    const result = await routes.getDeliveries({ endpointId: "ep-1", limit: 50, offset: 0 });

    expect(db.webhookDelivery.findMany).toHaveBeenCalled();
    expect(result.deliveries).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/routes/notification-endpoints.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement the route handlers**

```typescript
// apps/api/src/routes/notification-endpoints.ts
import { randomBytes } from "node:crypto";

interface WebhookDeps {
  db: any; // PrismaClient — uses interface to avoid coupling
}

interface CreateInput {
  orgId: string;
  body: {
    name: string;
    url: string;
    channelType: string;
    topics: string[];
    headers?: Record<string, string>;
  };
  createdBy?: string;
}

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function buildWebhookRoutes(deps: WebhookDeps) {
  async function createEndpoint(input: CreateInput) {
    const { orgId, body, createdBy } = input;
    return deps.db.webhookEndpoint.create({
      data: {
        orgId,
        name: body.name,
        url: body.url,
        channelType: body.channelType,
        secret: generateSecret(),
        topics: body.topics,
        headers: body.headers ?? {},
        createdBy: createdBy ?? null,
      },
    });
  }

  async function listEndpoints(input: { orgId: string; limit: number; offset: number }) {
    return deps.db.webhookEndpoint.findMany({
      where: { orgId: input.orgId },
      take: input.limit,
      skip: input.offset,
      orderBy: { createdAt: "desc" },
    });
  }

  async function getEndpoint(id: string) {
    return deps.db.webhookEndpoint.findUnique({ where: { id } });
  }

  async function updateEndpoint(id: string, data: Record<string, unknown>) {
    return deps.db.webhookEndpoint.update({
      where: { id },
      data,
    });
  }

  async function deleteEndpoint(id: string) {
    return deps.db.webhookEndpoint.delete({ where: { id } });
  }

  async function getDeliveries(input: { endpointId: string; limit: number; offset: number }) {
    const [deliveries, total] = await Promise.all([
      deps.db.webhookDelivery.findMany({
        where: { endpointId: input.endpointId },
        take: input.limit,
        skip: input.offset,
        orderBy: { createdAt: "desc" },
      }),
      deps.db.webhookDelivery.count({ where: { endpointId: input.endpointId } }),
    ]);
    return { deliveries, total };
  }

  return { createEndpoint, listEndpoints, getEndpoint, updateEndpoint, deleteEndpoint, getDeliveries };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/routes/notification-endpoints.test.ts`
Expected: 6 tests PASS.

**Step 5: Add `@sentinel/notifications` dependency to API package.json**

Add to `apps/api/package.json` dependencies:

```json
"@sentinel/notifications": "workspace:*"
```

Run: `cd /home/ainaomotayo/archagents/sentinel && pnpm install`

**Step 6: Register routes in server.ts**

Add to `apps/api/src/server.ts` after the Reports section (around line 780), before the graceful shutdown section:

```typescript
// --- Webhooks ---
import { buildWebhookRoutes } from "./routes/notification-endpoints.js";
const webhookRoutes = buildWebhookRoutes({ db });
// (Move import to top of file with other imports)

app.post("/v1/webhooks", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const result = await webhookRoutes.createEndpoint({
    orgId,
    body: request.body as any,
    createdBy: role,
  });
  reply.code(201).send(result);
});

app.get("/v1/webhooks", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  const { limit = "50", offset = "0" } = request.query as any;
  return webhookRoutes.listEndpoints({ orgId, limit: Number(limit), offset: Number(offset) });
});

app.get("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  return ep;
});

app.put("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  const body = request.body as Record<string, unknown>;
  return webhookRoutes.updateEndpoint(id, body);
});

app.delete("/v1/webhooks/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }
  await webhookRoutes.deleteEndpoint(id);
  reply.code(204).send();
});

app.get("/v1/webhooks/:id/deliveries", { preHandler: authHook }, async (request) => {
  const { id } = request.params as { id: string };
  const { limit = "50", offset = "0" } = request.query as any;
  return webhookRoutes.getDeliveries({ endpointId: id, limit: Number(limit), offset: Number(offset) });
});
```

**Step 7: Commit**

```bash
git add apps/api/src/routes/notification-endpoints.ts apps/api/src/routes/notification-endpoints.test.ts apps/api/src/server.ts apps/api/package.json
git commit -m "feat(api): add webhook CRUD routes (POST/GET/PUT/DELETE + delivery log)"
```

---

## Task 12: Webhook Test Endpoint & Notification Rules API

**Files:**
- Create: `apps/api/src/routes/notification-rules.ts`
- Create: `apps/api/src/routes/notification-rules.test.ts`
- Modify: `apps/api/src/server.ts`

**Step 1: Write the failing tests for notification rules**

```typescript
// apps/api/src/routes/notification-rules.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildNotificationRuleRoutes } from "./notification-rules.js";

function makeDeps() {
  const db = {
    notificationRule: {
      create: vi.fn().mockResolvedValue({
        id: "rule-1", orgId: "org-1", name: "Slack Critical", topics: ["finding.critical"],
        channelType: "slack", channelConfig: { webhookUrl: "https://hooks.slack.com/xxx" }, enabled: true,
      }),
      findMany: vi.fn().mockResolvedValue([
        { id: "rule-1", name: "Slack Critical", channelType: "slack", enabled: true },
      ]),
      findUnique: vi.fn().mockResolvedValue({ id: "rule-1" }),
      delete: vi.fn().mockResolvedValue({ id: "rule-1" }),
    },
  };
  return { db };
}

describe("buildNotificationRuleRoutes", () => {
  it("createRule stores rule with channel config", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });

    const result = await routes.createRule({
      orgId: "org-1",
      body: {
        name: "Slack Critical",
        topics: ["finding.critical"],
        channelType: "slack",
        channelConfig: { webhookUrl: "https://hooks.slack.com/xxx" },
      },
      createdBy: "admin",
    });

    expect(db.notificationRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        name: "Slack Critical",
        topics: ["finding.critical"],
        channelType: "slack",
      }),
    });
    expect(result.id).toBe("rule-1");
  });

  it("listRules returns rules for org", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });

    const result = await routes.listRules("org-1");

    expect(db.notificationRule.findMany).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("deleteRule removes rule", async () => {
    const { db } = makeDeps();
    const routes = buildNotificationRuleRoutes({ db: db as any });

    await routes.deleteRule("rule-1");

    expect(db.notificationRule.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/routes/notification-rules.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement notification rule handlers**

```typescript
// apps/api/src/routes/notification-rules.ts

interface RuleDeps {
  db: any;
}

interface CreateRuleInput {
  orgId: string;
  body: {
    name: string;
    topics: string[];
    condition?: Record<string, unknown>;
    channelType: string;
    channelConfig: Record<string, unknown>;
  };
  createdBy?: string;
}

export function buildNotificationRuleRoutes(deps: RuleDeps) {
  async function createRule(input: CreateRuleInput) {
    const { orgId, body, createdBy } = input;
    return deps.db.notificationRule.create({
      data: {
        orgId,
        name: body.name,
        topics: body.topics,
        condition: body.condition ?? null,
        channelType: body.channelType,
        channelConfig: body.channelConfig,
        createdBy: createdBy ?? null,
      },
    });
  }

  async function listRules(orgId: string) {
    return deps.db.notificationRule.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
    });
  }

  async function deleteRule(id: string) {
    return deps.db.notificationRule.delete({ where: { id } });
  }

  return { createRule, listRules, deleteRule };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/routes/notification-rules.test.ts`
Expected: 3 tests PASS.

**Step 5: Register notification rules + test webhook in server.ts**

Add to `apps/api/src/server.ts` after the webhook CRUD routes:

```typescript
// --- Webhook test endpoint ---
import { HttpWebhookAdapter } from "@sentinel/notifications";

app.post("/v1/webhooks/:id/test", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const ep = await webhookRoutes.getEndpoint(id);
  if (!ep) { reply.code(404).send({ error: "Webhook endpoint not found" }); return; }

  const adapter = new HttpWebhookAdapter();
  const testEvent = {
    id: `test-${Date.now()}`,
    orgId: ep.orgId,
    topic: "system.test",
    payload: { message: "Test webhook from SENTINEL", endpointId: id },
    timestamp: new Date().toISOString(),
  };
  const result = await adapter.deliver(ep, testEvent);
  return { ...result, event: testEvent };
});

// --- Notification rules ---
import { buildNotificationRuleRoutes } from "./routes/notification-rules.js";
const ruleRoutes = buildNotificationRuleRoutes({ db });

app.post("/v1/notifications/rules", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const role = (request as any).role ?? "unknown";
  const result = await ruleRoutes.createRule({ orgId, body: request.body as any, createdBy: role });
  reply.code(201).send(result);
});

app.get("/v1/notifications/rules", { preHandler: authHook }, async (request) => {
  const orgId = (request as any).orgId ?? "default";
  return ruleRoutes.listRules(orgId);
});

app.delete("/v1/notifications/rules/:id", { preHandler: authHook }, async (request, reply) => {
  const { id } = request.params as { id: string };
  await ruleRoutes.deleteRule(id);
  reply.code(204).send();
});
```

**Step 6: Commit**

```bash
git add apps/api/src/routes/notification-rules.ts apps/api/src/routes/notification-rules.test.ts apps/api/src/server.ts
git commit -m "feat(api): add notification rules CRUD and webhook test endpoint"
```

---

## Task 13: SSE Streaming Route

**Files:**
- Modify: `apps/api/src/server.ts`

**Step 1: Add SSE route to server.ts**

Add after the notification rules routes:

```typescript
// --- SSE Event Stream ---
import { SseManager } from "@sentinel/notifications";
import { randomUUID } from "node:crypto";

const sseManager = new SseManager();

app.get("/v1/events/stream", { preHandler: authHook }, async (request, reply) => {
  const orgId = (request as any).orgId ?? "default";
  const { topics = "scan.*,finding.*" } = request.query as { topics?: string };
  const topicList = topics.split(",").map((t) => t.trim()).filter(Boolean);

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const clientId = randomUUID();
  const client = {
    id: clientId,
    orgId,
    topics: topicList,
    write: (data: string) => {
      try { reply.raw.write(data); return true; } catch { return false; }
    },
    close: () => {
      try { reply.raw.end(); } catch { /* already closed */ }
    },
  };

  sseManager.register(client);

  // Heartbeat
  const heartbeat = setInterval(() => {
    try { reply.raw.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30_000);

  request.raw.on("close", () => {
    clearInterval(heartbeat);
    sseManager.unregister(clientId, orgId);
  });
});
```

**Step 2: Export sseManager for use by notification worker**

At the top of server.ts, after imports, export the sseManager. Or — since the SSE fan-out uses Redis pub/sub, add the Redis subscriber. Add near the bottom of server.ts, before the `export { app }`:

```typescript
// Redis pub/sub for SSE fan-out from notification-worker
const redisSub = redis.duplicate();
redisSub.subscribe("sentinel.events.fanout");
redisSub.on("message", (_channel: string, message: string) => {
  try {
    const event = JSON.parse(message);
    sseManager.broadcast(event);
  } catch { /* ignore malformed messages */ }
});

export { app, sseManager };
```

**Step 3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "feat(api): add SSE /v1/events/stream route with Redis pub/sub fan-out"
```

---

## Task 14: Notification Worker

**Files:**
- Create: `apps/api/src/notification-worker.ts`
- Create: `apps/api/src/__tests__/notification-worker.test.ts`

**Step 1: Write the failing tests**

```typescript
// apps/api/src/__tests__/notification-worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  processNotificationEvent,
  processRetryQueue,
} from "../notification-worker.js";

function makeDeps() {
  const db = {
    webhookEndpoint: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "ep-1", orgId: "org-1", url: "https://example.com/hook",
          channelType: "http", secret: "secret", topics: ["scan.completed"],
          headers: {}, enabled: true, name: "Test",
        },
      ]),
    },
    notificationRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    webhookDelivery: {
      create: vi.fn().mockResolvedValue({ id: "del-1" }),
      update: vi.fn().mockResolvedValue({ id: "del-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const adapter = {
    type: "http" as const,
    deliver: vi.fn().mockResolvedValue({ success: true, httpStatus: 200, durationMs: 50 }),
  };

  const registry = { get: vi.fn().mockReturnValue(adapter), has: vi.fn().mockReturnValue(true) };
  const redisPub = { publish: vi.fn().mockResolvedValue(1) };

  return { db, adapter, registry, redisPub };
}

describe("processNotificationEvent", () => {
  it("matches endpoints by topic and creates delivery records", async () => {
    const { db, registry, redisPub } = makeDeps();

    await processNotificationEvent(
      {
        id: "evt-1", orgId: "org-1", topic: "scan.completed",
        payload: { scanId: "s-1" }, timestamp: "2026-03-10T12:00:00Z",
      },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );

    expect(db.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        endpointId: "ep-1",
        orgId: "org-1",
        topic: "scan.completed",
        status: "delivered",
      }),
    });
  });

  it("publishes event to Redis for SSE fan-out", async () => {
    const { db, registry, redisPub } = makeDeps();

    await processNotificationEvent(
      {
        id: "evt-1", orgId: "org-1", topic: "scan.completed",
        payload: { scanId: "s-1" }, timestamp: "2026-03-10T12:00:00Z",
      },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );

    expect(redisPub.publish).toHaveBeenCalledWith(
      "sentinel.events.fanout",
      expect.any(String),
    );
  });

  it("marks delivery as failed with next retry on adapter failure", async () => {
    const { db, registry, redisPub } = makeDeps();
    const adapter = registry.get("http");
    adapter.deliver.mockResolvedValue({ success: false, httpStatus: 500, error: "Server Error", durationMs: 100 });

    await processNotificationEvent(
      {
        id: "evt-2", orgId: "org-1", topic: "scan.completed",
        payload: {}, timestamp: "2026-03-10T12:00:00Z",
      },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );

    expect(db.webhookDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "pending",
        lastError: "Server Error",
        nextRetryAt: expect.any(Date),
      }),
    });
  });

  it("skips disabled endpoints", async () => {
    const { db, registry, redisPub } = makeDeps();
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-1", orgId: "org-1", channelType: "http", topics: ["scan.completed"], enabled: false },
    ]);

    await processNotificationEvent(
      {
        id: "evt-3", orgId: "org-1", topic: "scan.completed",
        payload: {}, timestamp: "2026-03-10T12:00:00Z",
      },
      { db: db as any, registry: registry as any, redisPub: redisPub as any },
    );

    expect(db.webhookDelivery.create).not.toHaveBeenCalled();
  });
});

describe("processRetryQueue", () => {
  it("retries pending deliveries whose nextRetryAt has passed", async () => {
    const { db, registry } = makeDeps();
    const pastDate = new Date(Date.now() - 60_000);
    db.webhookDelivery.findMany.mockResolvedValue([
      {
        id: "del-1", endpointId: "ep-1", orgId: "org-1", topic: "scan.completed",
        payload: { scanId: "s-1" }, status: "pending", attempt: 1, maxAttempts: 5,
        nextRetryAt: pastDate, lastError: "500",
      },
    ]);
    db.webhookEndpoint.findMany.mockResolvedValue([
      {
        id: "ep-1", orgId: "org-1", url: "https://example.com/hook",
        channelType: "http", secret: "secret", topics: ["scan.completed"],
        headers: {}, enabled: true, name: "Test",
      },
    ]);

    await processRetryQueue({ db: db as any, registry: registry as any });

    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "del-1" },
      data: expect.objectContaining({ status: "delivered" }),
    });
  });

  it("moves delivery to DLQ after max attempts", async () => {
    const { db, registry } = makeDeps();
    const adapter = registry.get("http");
    adapter.deliver.mockResolvedValue({ success: false, error: "Still failing", durationMs: 50 });

    db.webhookDelivery.findMany.mockResolvedValue([
      {
        id: "del-2", endpointId: "ep-1", orgId: "org-1", topic: "scan.completed",
        payload: {}, status: "pending", attempt: 5, maxAttempts: 5,
        nextRetryAt: new Date(Date.now() - 1000), lastError: "500",
      },
    ]);
    db.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-1", orgId: "org-1", url: "https://example.com/hook", channelType: "http", secret: "s", topics: [], headers: {}, enabled: true, name: "T" },
    ]);

    await processRetryQueue({ db: db as any, registry: registry as any });

    expect(db.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: "del-2" },
      data: expect.objectContaining({ status: "dlq" }),
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/__tests__/notification-worker.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement notification worker**

```typescript
// apps/api/src/notification-worker.ts
import http from "node:http";
import { Redis } from "ioredis";
import { EventBus, withRetry } from "@sentinel/events";
import { getDb, disconnectDb } from "@sentinel/db";
import {
  HttpWebhookAdapter,
  SlackAdapter,
  PagerDutyAdapter,
  AdapterRegistry,
  TopicTrie,
  type NotificationEvent,
} from "@sentinel/notifications";
import { createLogger, initTracing, shutdownTracing } from "@sentinel/telemetry";

const logger = createLogger({ name: "notification-worker" });

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const redisPub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const eventBus = new EventBus(redis);
const db = getDb();

// Build adapter registry
const registry = new AdapterRegistry();
registry.register(new HttpWebhookAdapter());
registry.register(new SlackAdapter());
registry.register(new PagerDutyAdapter());
// Email adapter requires SMTP config — skip if not configured

// --- Retry scheduling ---

function computeNextRetry(attempt: number): Date {
  const base = 5_000;
  const jitter = Math.random() * 5_000;
  const maxDelay = 3_600_000; // 1 hour
  const delay = Math.min(base * Math.pow(2, attempt) + jitter, maxDelay);
  return new Date(Date.now() + delay);
}

// --- Core processing (exported for testing) ---

interface WorkerDeps {
  db: any;
  registry: AdapterRegistry;
  redisPub?: any;
}

export async function processNotificationEvent(
  event: NotificationEvent,
  deps: WorkerDeps,
): Promise<void> {
  // Publish to Redis for SSE fan-out
  if (deps.redisPub) {
    await deps.redisPub.publish("sentinel.events.fanout", JSON.stringify(event));
  }

  // Find matching endpoints
  const endpoints = await deps.db.webhookEndpoint.findMany({
    where: { orgId: event.orgId, enabled: true },
  });

  // Build trie for this org's endpoints and match
  const trie = new TopicTrie<string>();
  const endpointMap = new Map<string, typeof endpoints[0]>();
  for (const ep of endpoints) {
    endpointMap.set(ep.id, ep);
    for (const topic of ep.topics) {
      trie.add(topic, ep.id);
    }
  }

  const matchedIds = trie.match(event.topic);

  for (const epId of matchedIds) {
    const ep = endpointMap.get(epId);
    if (!ep) continue;

    const adapter = deps.registry.get(ep.channelType);
    if (!adapter) continue;

    const result = await adapter.deliver(ep, event);

    if (result.success) {
      await deps.db.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          orgId: event.orgId,
          topic: event.topic,
          payload: event,
          status: "delivered",
          httpStatus: result.httpStatus ?? null,
          attempt: 1,
          deliveredAt: new Date(),
        },
      });
    } else {
      await deps.db.webhookDelivery.create({
        data: {
          endpointId: ep.id,
          orgId: event.orgId,
          topic: event.topic,
          payload: event,
          status: "pending",
          httpStatus: result.httpStatus ?? null,
          attempt: 1,
          lastError: result.error ?? null,
          nextRetryAt: computeNextRetry(1),
        },
      });
    }
  }

  // Also process notification rules (Slack/email/PD)
  const rules = await deps.db.notificationRule.findMany({
    where: { orgId: event.orgId, enabled: true },
  });

  const ruleTrie = new TopicTrie<string>();
  const ruleMap = new Map<string, typeof rules[0]>();
  for (const rule of rules) {
    ruleMap.set(rule.id, rule);
    for (const topic of rule.topics) {
      ruleTrie.add(topic, rule.id);
    }
  }

  const matchedRuleIds = ruleTrie.match(event.topic);
  for (const ruleId of matchedRuleIds) {
    const rule = ruleMap.get(ruleId);
    if (!rule) continue;

    const adapter = deps.registry.get(rule.channelType);
    if (!adapter) continue;

    await adapter.deliver(rule, event);
  }
}

export async function processRetryQueue(deps: WorkerDeps): Promise<void> {
  const pendingDeliveries = await deps.db.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: new Date() },
    },
    take: 50,
  });

  if (pendingDeliveries.length === 0) return;

  // Fetch all referenced endpoints
  const epIds = [...new Set(pendingDeliveries.map((d: any) => d.endpointId))];
  const endpoints = await deps.db.webhookEndpoint.findMany({
    where: { id: { in: epIds } },
  });
  const epMap = new Map(endpoints.map((ep: any) => [ep.id, ep]));

  for (const delivery of pendingDeliveries) {
    const ep = epMap.get(delivery.endpointId);
    if (!ep) continue;

    const adapter = deps.registry.get(ep.channelType);
    if (!adapter) continue;

    const event: NotificationEvent = delivery.payload as NotificationEvent;
    const result = await adapter.deliver(ep, event);

    if (result.success) {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "delivered",
          httpStatus: result.httpStatus ?? null,
          attempt: delivery.attempt + 1,
          deliveredAt: new Date(),
          lastError: null,
          nextRetryAt: null,
        },
      });
    } else if (delivery.attempt >= delivery.maxAttempts) {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "dlq",
          attempt: delivery.attempt + 1,
          lastError: result.error ?? null,
          nextRetryAt: null,
        },
      });
    } else {
      await deps.db.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "pending",
          attempt: delivery.attempt + 1,
          lastError: result.error ?? null,
          nextRetryAt: computeNextRetry(delivery.attempt + 1),
        },
      });
    }
  }
}

// --- Main process (only runs when executed directly, not imported for tests) ---

if (process.env.NODE_ENV !== "test") {
  initTracing("notification-worker");

  // Stream consumer
  const wrappedHandler = withRetry(redis, "sentinel.notifications", async (_id: string, data: Record<string, unknown>) => {
    const event = data as unknown as NotificationEvent;
    await processNotificationEvent(event, { db, registry, redisPub });
  }, { maxRetries: 3, baseDelayMs: 1000 });

  eventBus.subscribe("sentinel.notifications", "notification-workers", `notif-${process.pid}`, wrappedHandler);

  // Retry poller
  const retryInterval = setInterval(async () => {
    try {
      await processRetryQueue({ db, registry });
    } catch (err) {
      logger.error({ err }, "Retry queue processing failed");
    }
  }, 5_000);

  // Health server
  const healthPort = parseInt(process.env.NOTIFICATION_WORKER_PORT ?? "9095", 10);
  const healthServer = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  healthServer.listen(healthPort);
  logger.info({ port: healthPort }, "Notification worker health server listening");

  // Graceful shutdown
  const shutdown = async () => {
    clearInterval(retryInterval);
    healthServer.close();
    logger.info("Notification worker shutting down...");
    await eventBus.disconnect();
    redisPub.disconnect();
    await shutdownTracing();
    await disconnectDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Notification worker started — consuming sentinel.notifications");
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api -- --run src/__tests__/notification-worker.test.ts`
Expected: 6 tests PASS.

**Step 5: Commit**

```bash
git add apps/api/src/notification-worker.ts apps/api/src/__tests__/notification-worker.test.ts
git commit -m "feat(api): add notification-worker with stream consumer, retry poller, and DLQ"
```

---

## Task 15: Emit Notification Events from Existing Code

**Files:**
- Modify: `apps/api/src/server.ts` (add `sentinel.notifications` publishes)
- Modify: `apps/api/src/worker.ts` (emit scan.completed/scan.failed)
- Modify: `apps/api/src/report-worker.ts` (emit compliance.report_ready)

**Step 1: Add notification event publishing to server.ts**

In `server.ts`, after each existing `eventBus.publish("sentinel.evidence", ...)` call, add a corresponding notification publish. Key locations:

After scan submission (POST /v1/scans):
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${scan.id}-submitted`,
  orgId,
  topic: "scan.submitted",
  payload: { scanId: scan.id, projectId: body.projectId, commitHash: body.commitHash, branch: body.branch },
  timestamp: new Date().toISOString(),
});
```

After finding suppression (PATCH /v1/findings/:id):
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${id}-suppressed`,
  orgId,
  topic: "finding.suppressed",
  payload: { findingId: id, suppressedBy: body.suppressedBy ?? null, severity: finding.severity },
  timestamp: new Date().toISOString(),
});
```

After certificate revocation (POST /v1/certificates/:id/revoke):
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${id}-revoked`,
  orgId,
  topic: "certificate.revoked",
  payload: { certificateId: id, reason },
  timestamp: new Date().toISOString(),
});
```

After policy create/update/delete:
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${policy.id}-created`,
  orgId,
  topic: "policy.created",
  payload: { policyId: policy.id, name: policy.name, version: policy.version },
  timestamp: new Date().toISOString(),
});
```

**Step 2: Add notification publishing to worker.ts**

In `finalizeScan()` or after scan assessment completes:
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${scanId}-completed`,
  orgId: scan.orgId,
  topic: "scan.completed",
  payload: { scanId, riskScore: assessment.riskScore, verdict: assessment.verdict, findingCount: findings.length },
  timestamp: new Date().toISOString(),
});
```

For critical findings:
```typescript
for (const finding of findings.filter(f => f.severity === "critical")) {
  await eventBus.publish("sentinel.notifications", {
    id: `evt-${finding.id}-critical`,
    orgId: scan.orgId,
    topic: "finding.critical",
    payload: { findingId: finding.id, severity: "critical", category: finding.category, agentName: finding.agentName, file: finding.file },
    timestamp: new Date().toISOString(),
  });
}
```

**Step 3: Add notification publishing to report-worker.ts**

After report completes:
```typescript
await eventBus.publish("sentinel.notifications", {
  id: `evt-${reportId}-ready`,
  orgId,
  topic: "compliance.report_ready",
  payload: { reportId, type, fileUrl },
  timestamp: new Date().toISOString(),
});
```

**Step 4: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/worker.ts apps/api/src/report-worker.ts
git commit -m "feat(api): emit notification events from scan, finding, certificate, policy, and report flows"
```

---

## Task 16: Docker Compose — Notification Worker Service

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add notification-worker service**

Add after the `report-worker` service definition:

```yaml
  notification-worker:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://sentinel:sentinel_dev@postgres:5432/sentinel
      REDIS_URL: redis://redis:6379
      NOTIFICATION_WORKER_PORT: "9095"
    command: ["node", "apps/api/dist/notification-worker.js"]
    healthcheck:
      test: ["CMD", "node", "docker/healthcheck.js", "9095"]
      interval: 30s
      timeout: 5s
      retries: 3
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add notification-worker service on port 9095"
```

---

## Task 17: Run All Package Tests

**Step 1: Run notifications package tests**

Run: `cd /home/ainaomotayo/archagents/sentinel/packages/notifications && npx vitest run`
Expected: ~30 tests PASS (trie: 8, http: 7, slack: 5, email: 4, pagerduty: 4, sse: 6).

**Step 2: Run API tests**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo test --filter=@sentinel/api`
Expected: All existing + new tests PASS (~80 total).

**Step 3: Build entire project**

Run: `cd /home/ainaomotayo/archagents/sentinel && npx turbo build`
Expected: All packages build successfully.

**Step 4: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve test and build issues for P7 notifications"
```

---

## Summary

| Task | Component | Tests | Files |
|------|-----------|-------|-------|
| 1 | Package scaffold + types | 0 | 4 new |
| 2 | TopicTrie | 8 | 2 new |
| 3 | HttpWebhookAdapter | 7 | 2 new |
| 4 | SlackAdapter | 5 | 2 new |
| 5 | EmailAdapter | 4 | 2 new |
| 6 | PagerDutyAdapter | 4 | 2 new |
| 7 | AdapterRegistry | 0 | 1 new |
| 8 | SseManager | 6 | 2 new |
| 9 | Prisma models | 0 | 1 modified + migration |
| 10 | RBAC permissions | 5 | 2 modified |
| 11 | Webhook CRUD routes | 6 | 3 new, 2 modified |
| 12 | Notification rules + test endpoint | 3 | 2 new, 1 modified |
| 13 | SSE streaming route | 0 | 1 modified |
| 14 | Notification worker | 6 | 2 new |
| 15 | Emit events from existing code | 0 | 3 modified |
| 16 | Docker compose | 0 | 1 modified |
| 17 | Integration verification | 0 | 0 |
| **Total** | | **~54** | **~25 new, ~10 modified** |
