// tests/e2e/services/event-stream.ts
export interface SentinelEvent {
  id: string;
  orgId: string;
  topic: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export class EventStreamClient {
  private controller: AbortController | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly orgId: string,
  ) {}

  async collectUntil(
    topics: string[],
    predicate: (event: SentinelEvent) => boolean,
    timeoutMs = 30_000,
  ): Promise<SentinelEvent[]> {
    const events: SentinelEvent[] = [];
    const topicsParam = encodeURIComponent(topics.join(","));
    const url = `${this.baseUrl}/v1/events/stream?topics=${topicsParam}&orgId=${encodeURIComponent(this.orgId)}`;

    this.controller = new AbortController();
    const timeout = setTimeout(() => this.controller?.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: this.controller.signal });
      if (!res.body) throw new Error("No response body for SSE stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6)) as SentinelEvent;
              events.push(event);
              if (predicate(event)) {
                reader.cancel();
                return events;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // Timeout — return what we have
      } else throw err;
    } finally {
      clearTimeout(timeout);
      this.controller = null;
    }
    return events;
  }

  disconnect(): void {
    this.controller?.abort();
  }
}
