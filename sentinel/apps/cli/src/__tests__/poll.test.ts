import { describe, it, expect } from "vitest";
import { pollWithBackoff } from "../poll.js";

describe("pollWithBackoff", () => {
  it("returns immediately when fn resolves on first call", async () => {
    const result = await pollWithBackoff(
      async () => ({ done: true, value: "instant" }),
      { initialDelayMs: 10, maxJitterMs: 0 },
    );
    expect(result).toBe("instant");
  });

  it("polls multiple times until done", async () => {
    let calls = 0;
    const result = await pollWithBackoff(
      async () => {
        calls++;
        return calls >= 3
          ? { done: true, value: "after-3" }
          : { done: false, value: null };
      },
      { initialDelayMs: 10, maxJitterMs: 0, timeoutMs: 5000 },
    );
    expect(result).toBe("after-3");
    expect(calls).toBe(3);
  });

  it("throws on timeout", async () => {
    await expect(
      pollWithBackoff(async () => ({ done: false, value: null }), {
        initialDelayMs: 10,
        maxJitterMs: 0,
        timeoutMs: 50,
      }),
    ).rejects.toThrow("Poll timed out after 50ms");
  });

  it("respects abort signal", async () => {
    const ac = new AbortController();
    const promise = pollWithBackoff(
      async () => {
        ac.abort();
        return { done: false, value: null };
      },
      { initialDelayMs: 10, maxJitterMs: 0, signal: ac.signal },
    );
    await expect(promise).rejects.toThrow();
  });

  it("delay increases exponentially", async () => {
    const startTimes: number[] = [];
    let calls = 0;
    await pollWithBackoff(
      async () => {
        startTimes.push(Date.now());
        calls++;
        return calls >= 4
          ? { done: true, value: "done" }
          : { done: false, value: null };
      },
      { initialDelayMs: 50, maxJitterMs: 0, backoffFactor: 2, timeoutMs: 5000 },
    );

    // Delays between calls should roughly double: ~50, ~100, ~200
    const delays = [];
    for (let i = 1; i < startTimes.length; i++) {
      delays.push(startTimes[i] - startTimes[i - 1]);
    }
    // Second delay should be roughly double the first
    expect(delays[1]).toBeGreaterThanOrEqual(delays[0] * 1.5);
    // Third delay should be roughly double the second
    expect(delays[2]).toBeGreaterThanOrEqual(delays[1] * 1.5);
  });

  it("caps delay at maxDelayMs", async () => {
    const startTimes: number[] = [];
    let calls = 0;
    await pollWithBackoff(
      async () => {
        startTimes.push(Date.now());
        calls++;
        return calls >= 6
          ? { done: true, value: "done" }
          : { done: false, value: null };
      },
      {
        initialDelayMs: 20,
        maxDelayMs: 40,
        maxJitterMs: 0,
        backoffFactor: 2,
        timeoutMs: 5000,
      },
    );

    // After a few iterations, delays should not exceed maxDelayMs (40ms) + tolerance
    const delays = [];
    for (let i = 1; i < startTimes.length; i++) {
      delays.push(startTimes[i] - startTimes[i - 1]);
    }
    // Later delays should be capped around 40ms (allow some tolerance for timer imprecision)
    for (const d of delays.slice(2)) {
      expect(d).toBeLessThan(80); // generous tolerance but proves capping
    }
  });

  it("uses default options when none provided", async () => {
    const result = await pollWithBackoff(
      async () => ({ done: true, value: 42 }),
    );
    expect(result).toBe(42);
  });

  it("propagates fn errors", async () => {
    await expect(
      pollWithBackoff(
        async () => {
          throw new Error("boom");
        },
        { initialDelayMs: 10, maxJitterMs: 0 },
      ),
    ).rejects.toThrow("boom");
  });
});
