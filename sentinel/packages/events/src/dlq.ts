import type { Redis } from "ioredis";

export interface DlqOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  dlqStream?: string;
}

const retryTracker = new Map<string, number>();

/**
 * Wrap a handler with retry + DLQ logic.
 * On failure: increment retry count. If under maxRetries, wait with exponential backoff and re-throw.
 * At maxRetries: move message to DLQ stream, don't re-throw (message will be ACKed).
 */
export function withRetry(
  redis: Redis,
  stream: string,
  handler: (id: string, data: Record<string, unknown>) => Promise<void>,
  options?: DlqOptions,
): (id: string, data: Record<string, unknown>) => Promise<void> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1000;
  const dlqStream = options?.dlqStream ?? `${stream}.dlq`;

  return async (id: string, data: Record<string, unknown>) => {
    try {
      await handler(id, data);
      retryTracker.delete(id);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const attempts = (retryTracker.get(id) ?? 0) + 1;
      retryTracker.set(id, attempts);

      if (attempts >= maxRetries) {
        // Move to DLQ
        await redis.xadd(
          dlqStream,
          "*",
          "data",
          JSON.stringify(data),
          "originalStream",
          stream,
          "originalId",
          id,
          "error",
          errorMsg,
          "attempts",
          String(attempts),
        );
        retryTracker.delete(id);
        // Don't re-throw — let the message be ACKed
        return;
      }

      // Exponential backoff: base * 2^(attempt-1)
      const delay = baseDelayMs * Math.pow(2, attempts - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Re-throw to prevent ACK
      throw err;
    }
  };
}

/**
 * Get DLQ depth.
 */
export async function getDlqDepth(
  redis: Redis,
  dlqStream: string,
): Promise<number> {
  return redis.xlen(dlqStream);
}

/**
 * Read messages from DLQ for monitoring.
 */
export async function readDlq(
  redis: Redis,
  dlqStream: string,
  count: number = 50,
): Promise<Array<{ id: string; data: Record<string, string> }>> {
  const results = await redis.xrevrange(dlqStream, "+", "-", "COUNT", count);
  return results.map(([id, fields]: [string, string[]]) => {
    const data: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      data[fields[i]] = fields[i + 1];
    }
    return { id, data };
  });
}
