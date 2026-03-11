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
