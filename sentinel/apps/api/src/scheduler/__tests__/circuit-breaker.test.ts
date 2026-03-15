import { describe, test, expect, beforeEach, vi } from "vitest";
import { CircuitBreakerManager } from "../circuit-breaker.js";

describe("CircuitBreakerManager", () => {
  let cb: CircuitBreakerManager;

  beforeEach(() => {
    cb = new CircuitBreakerManager();
  });

  test("starts in closed state", () => {
    expect(cb.canExecute("redis", "critical")).toBe(true);
    expect(cb.getState("redis")).toBe("closed");
  });

  test("opens after non-critical failure threshold (3)", () => {
    cb.recordFailure("redis");
    cb.recordFailure("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(true);
    cb.recordFailure("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(false);
    expect(cb.getState("redis")).toBe("open");
  });

  test("critical jobs tolerate more failures (5)", () => {
    for (let i = 0; i < 4; i++) cb.recordFailure("postgres");
    expect(cb.canExecute("postgres", "critical")).toBe(true);
    cb.recordFailure("postgres");
    expect(cb.canExecute("postgres", "critical")).toBe(false);
  });

  test("success resets failure count", () => {
    cb.recordFailure("redis");
    cb.recordFailure("redis");
    cb.recordSuccess("redis");
    expect(cb.canExecute("redis", "non-critical")).toBe(true);
    expect(cb.getState("redis")).toBe("closed");
  });

  test("transitions to half-open after cooldown", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    expect(cb.getState("redis")).toBe("open");

    vi.advanceTimersByTime(31000);
    expect(cb.canExecute("redis", "critical")).toBe(true);
    expect(cb.getState("redis")).toBe("half-open");
    vi.useRealTimers();
  });

  test("half-open closes on success", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    vi.advanceTimersByTime(31000);
    cb.canExecute("redis", "critical");
    cb.recordSuccess("redis");
    expect(cb.getState("redis")).toBe("closed");
    vi.useRealTimers();
  });

  test("half-open reopens on failure", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) cb.recordFailure("redis");
    vi.advanceTimersByTime(31000);
    cb.canExecute("redis", "critical");
    cb.recordFailure("redis");
    expect(cb.getState("redis")).toBe("open");
    vi.useRealTimers();
  });

  test("getAllStates returns all tracked dependencies", () => {
    cb.recordFailure("redis");
    cb.recordFailure("postgres");
    const states = cb.getAllStates();
    expect(states).toHaveProperty("redis");
    expect(states).toHaveProperty("postgres");
  });
});
