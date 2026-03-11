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
    const config =
      ((endpoint as NotificationRuleConfig).channelConfig as Record<string, string>) ?? {};
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
