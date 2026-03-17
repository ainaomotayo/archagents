import { describe, test, expect } from "vitest";
import { ProviderHealthMonitor } from "@sentinel/security";

describe("provider health", () => {
  test("reports healthy after successes", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("okta");
    expect(monitor.getHealth("okta").status).toBe("healthy");
  });

  test("getAll returns tracked providers", () => {
    const monitor = new ProviderHealthMonitor();
    monitor.recordSuccess("okta");
    monitor.recordSuccess("azure-ad");
    expect(Object.keys(monitor.getAll())).toContain("okta");
  });
});
