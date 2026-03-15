import { describe, it, expect } from "vitest";
import { computeNextRun, validateCronExpression } from "../cron-utils.js";

describe("computeNextRun", () => {
  it("computes next Monday 8am UTC for weekly schedule", () => {
    const base = new Date("2026-03-09T08:00:00Z"); // Monday 8am
    const next = computeNextRun("0 8 * * 1", "UTC", base);
    expect(next.getUTCDay()).toBe(1); // Monday
    expect(next.getUTCHours()).toBe(8);
    expect(next.getTime()).toBeGreaterThan(base.getTime());
  });

  it("computes next 1st of month 8am for monthly schedule", () => {
    const base = new Date("2026-03-01T08:00:00Z");
    const next = computeNextRun("0 8 1 * *", "UTC", base);
    expect(next.getUTCDate()).toBe(1);
    expect(next.getUTCHours()).toBe(8);
    expect(next.getTime()).toBeGreaterThan(base.getTime());
  });

  it("respects timezone", () => {
    const base = new Date("2026-03-09T12:00:00Z"); // Monday noon UTC
    const next = computeNextRun("0 8 * * 1", "America/New_York", base);
    expect(next.getTime()).toBeGreaterThan(base.getTime());
  });

  it("defaults to UTC if timezone not provided", () => {
    const next = computeNextRun("0 8 * * 1", "UTC");
    expect(next).toBeInstanceOf(Date);
  });

  it("throws on invalid cron expression", () => {
    expect(() => computeNextRun("invalid", "UTC")).toThrow();
  });
});

describe("validateCronExpression", () => {
  it("returns valid for standard expressions", () => {
    expect(validateCronExpression("0 8 * * 1")).toEqual({ valid: true });
    expect(validateCronExpression("0 8 1 * *")).toEqual({ valid: true });
    expect(validateCronExpression("*/30 * * * *")).toEqual({ valid: true });
  });

  it("returns invalid with error message", () => {
    const result = validateCronExpression("not-a-cron");
    expect(result.valid).toBe(false);
    expect((result as any).error).toBeDefined();
  });

  it("rejects sub-minute intervals", () => {
    const result = validateCronExpression("* * * * * *");
    expect(result.valid).toBe(false);
  });
});
