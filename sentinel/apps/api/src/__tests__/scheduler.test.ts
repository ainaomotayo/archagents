import { describe, test, expect } from "vitest";
import { buildSchedulerConfig, shouldTriggerScan } from "../scheduler.js";

describe("scheduler", () => {
  test("buildSchedulerConfig returns valid config from SELF_SCAN_CONFIG", () => {
    const config = buildSchedulerConfig();
    expect(config.schedule).toBe("0 2 * * *");
    expect(config.targets.length).toBeGreaterThan(0);
    expect(config.enabled).toBe(true);
  });

  test("buildSchedulerConfig can be disabled via env var", () => {
    const original = process.env.SELF_SCAN_ENABLED;
    process.env.SELF_SCAN_ENABLED = "false";
    const config = buildSchedulerConfig();
    expect(config.enabled).toBe(false);
    if (original !== undefined) {
      process.env.SELF_SCAN_ENABLED = original;
    } else {
      delete process.env.SELF_SCAN_ENABLED;
    }
  });

  test("shouldTriggerScan returns true when config is valid and enabled", () => {
    const config = buildSchedulerConfig();
    expect(shouldTriggerScan(config)).toBe(true);
  });

  test("shouldTriggerScan returns false when disabled", () => {
    const config = buildSchedulerConfig();
    config.enabled = false;
    expect(shouldTriggerScan(config)).toBe(false);
  });
});
