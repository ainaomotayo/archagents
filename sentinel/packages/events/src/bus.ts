import type { Redis } from "ioredis";

export class EventBus {
  private subscriber: Redis | null = null;
  private running = false;

  constructor(private redis: Redis) {}

  /**
   * Publish an event to a Redis Stream.
   * Returns the stream entry ID assigned by Redis.
   */
  async publish(
    stream: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const serialized = JSON.stringify(data);
    const id = await this.redis.xadd(stream, "*", "data", serialized);
    return id as string;
  }

  /**
   * Subscribe to a stream using consumer groups.
   * Creates the consumer group if it doesn't exist.
   * Processes messages and ACKs them after the handler completes.
   */
  async subscribe(
    stream: string,
    group: string,
    consumer: string,
    handler: (id: string, data: Record<string, unknown>) => Promise<void>,
    options?: { blockMs?: number; count?: number },
  ): Promise<void> {
    const blockMs = options?.blockMs ?? 5000;
    const count = options?.count ?? 10;

    // Create consumer group with MKSTREAM; ignore if it already exists
    try {
      await this.redis.xgroup("CREATE", stream, group, "0", "MKSTREAM");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("BUSYGROUP")) {
        throw err;
      }
    }

    // Duplicate the connection for blocking reads
    this.subscriber = this.redis.duplicate();
    this.running = true;

    while (this.running) {
      const results = (await this.subscriber.xreadgroup(
        "GROUP",
        group,
        consumer,
        "COUNT",
        count,
        "BLOCK",
        blockMs,
        "STREAMS",
        stream,
        ">",
      )) as [string, [string, string[]][]][] | null;

      if (!results) {
        continue;
      }

      for (const [, messages] of results) {
        for (const [id, fields] of messages) {
          // fields is [key, value, key, value, ...]
          const dataIndex = fields.indexOf("data");
          if (dataIndex === -1 || dataIndex + 1 >= fields.length) {
            continue;
          }
          const parsed = JSON.parse(fields[dataIndex + 1]) as Record<
            string,
            unknown
          >;
          try {
            await handler(id, parsed);
            await this.subscriber.xack(stream, group, id);
          } catch {
            // Handler threw — don't ACK. Message stays pending for redelivery.
            // The withRetry wrapper handles DLQ logic.
          }
        }
      }
    }
  }

  /** Stop the subscribe loop and disconnect all connections. */
  async disconnect(): Promise<void> {
    this.running = false;
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    this.redis.disconnect();
  }
}
