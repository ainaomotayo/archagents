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
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 8px;font-weight:bold">${k}</td><td style="padding:4px 8px">${String(v)}</td></tr>`,
    )
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
    const config =
      ((endpoint as NotificationRuleConfig).channelConfig as Record<
        string,
        unknown
      >) ?? {};
    const to = Array.isArray(config.to)
      ? (config.to as string[]).join(", ")
      : String(config.to ?? "");
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
