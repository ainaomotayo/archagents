import { describe, it, expect, vi } from "vitest";

describe("SentinelContext", () => {
  it("SentinelConfig has all required fields", async () => {
    const { defaultConfig } = await import("../../src/context.js");
    expect(defaultConfig).toHaveProperty("apiUrl");
    expect(defaultConfig).toHaveProperty("orgId");
    expect(defaultConfig).toHaveProperty("enableGutterIcons");
    expect(defaultConfig).toHaveProperty("autoScanOnSave");
    expect(defaultConfig).toHaveProperty("autoScanDebounceMs");
    expect(defaultConfig).toHaveProperty("severityThreshold");
  });

  it("severityOrder ranks critical highest", async () => {
    const { severityOrder } = await import("../../src/context.js");
    expect(severityOrder.critical).toBeLessThan(severityOrder.high);
    expect(severityOrder.high).toBeLessThan(severityOrder.medium);
    expect(severityOrder.medium).toBeLessThan(severityOrder.low);
    expect(severityOrder.low).toBeLessThan(severityOrder.info);
  });
});
