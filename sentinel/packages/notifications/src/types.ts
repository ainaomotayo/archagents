export interface NotificationEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export type ChannelType = "http" | "slack" | "email" | "pagerduty";

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

export type DeliveryStatus = "pending" | "delivered" | "failed" | "dlq";

export interface SseClient {
  id: string;
  orgId: string;
  topics: string[];
  write: (data: string) => boolean;
  close: () => void;
}
