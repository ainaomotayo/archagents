import type { SentinelEvent } from "./types.js";

export interface EventSourceLike {
  onopen: ((evt: unknown) => void) | null;
  onmessage: ((evt: { data: string }) => void) | null;
  onerror: ((evt: unknown) => void) | null;
  close(): void;
}

export interface EventSourceConstructor {
  new (url: string): EventSourceLike;
}

export class SseListener {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly orgId: string;
  private readonly topics: string[];
  private readonly onEvent: (event: SentinelEvent) => void;
  private readonly EventSourceClass: EventSourceConstructor;

  private es: EventSourceLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;

  constructor(
    baseUrl: string,
    apiToken: string,
    orgId: string,
    topics: string[],
    onEvent: (event: SentinelEvent) => void,
    EventSourceClass?: EventSourceConstructor,
  ) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
    this.orgId = orgId;
    this.topics = topics;
    this.onEvent = onEvent;
    this.EventSourceClass = EventSourceClass ?? (globalThis as unknown as { EventSource: EventSourceConstructor }).EventSource;
  }

  connect(): void {
    const topicsParam = encodeURIComponent(this.topics.join(","));
    const url = `${this.baseUrl}/v1/events/stream?topics=${topicsParam}&orgId=${encodeURIComponent(this.orgId)}`;
    this.es = new this.EventSourceClass(url);

    this.es.onopen = () => {
      this.attempts = 0;
    };

    this.es.onmessage = (evt) => {
      try {
        const event = JSON.parse(evt.data) as SentinelEvent;
        this.onEvent(event);
        this.attempts = 0;
      } catch {
        // ignore malformed messages
      }
    };

    this.es.onerror = () => {
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }

  getReconnectDelay(): number {
    return Math.min(1000 * Math.pow(2, this.attempts), 30_000);
  }

  private scheduleReconnect(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    const delay = this.getReconnectDelay();
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
