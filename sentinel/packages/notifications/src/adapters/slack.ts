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
    attachments: [{ color, fields }],
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
    const config =
      (endpoint as NotificationRuleConfig).channelConfig ?? {};
    const webhookUrl =
      (config as Record<string, string>).webhookUrl ??
      (endpoint as WebhookEndpointConfig).url;
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
