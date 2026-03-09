import { describe, it, expect } from "vitest";
import { registry, httpRequestDuration, findingsTotal } from "../metrics.js";

describe("metrics", () => {
  it("registry contains sentinel metrics", async () => {
    const metrics = await registry.getMetricsAsJSON();
    const names = metrics.map((m) => m.name);
    expect(names).toContain("sentinel_http_request_duration_seconds");
    expect(names).toContain("sentinel_findings_total");
  });

  it("can observe histogram values", () => {
    httpRequestDuration.observe({ method: "GET", route: "/health", status_code: "200" }, 0.05);
  });

  it("can increment counters", () => {
    findingsTotal.inc({ severity: "high", agent: "security" });
  });
});
