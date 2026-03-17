export interface PollOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  maxJitterMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function pollWithBackoff<T>(
  fn: () => Promise<{ done: boolean; value: T }>,
  opts: PollOptions = {},
): Promise<T> {
  const {
    initialDelayMs = 1000,
    maxDelayMs = 16_000,
    backoffFactor = 2,
    maxJitterMs = 500,
    timeoutMs = 300_000,
  } = opts;

  const deadline = Date.now() + timeoutMs;
  let delay = initialDelayMs;

  while (Date.now() < deadline) {
    opts.signal?.throwIfAborted();
    const result = await fn();
    if (result.done) return result.value;

    const jitter = Math.random() * maxJitterMs;
    const wait = Math.min(delay + jitter, maxDelayMs);
    await new Promise((r) => setTimeout(r, wait));
    delay = Math.min(delay * backoffFactor, maxDelayMs);
  }

  throw new Error(`Poll timed out after ${timeoutMs}ms`);
}
