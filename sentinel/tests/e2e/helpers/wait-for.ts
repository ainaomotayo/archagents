// tests/e2e/helpers/wait-for.ts
export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 30_000, intervalMs = 300, label = "condition" } = opts;
  const deadline = Date.now() + timeoutMs;
  let delay = intervalMs;
  let lastResult: T | undefined;

  while (Date.now() < deadline) {
    lastResult = await fn();
    if (predicate(lastResult)) return lastResult;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
  throw new Error(`waitFor(${label}) timed out after ${timeoutMs}ms`);
}
