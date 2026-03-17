import { describe, it, expect, beforeEach } from "vitest";
import { register } from "prom-client";

describe("API metrics", () => {
  beforeEach(() => {
    register.clear();
  });

  it("registers custom metrics", async () => {
    // Re-import to trigger metric registration
    const { httpRequestsTotal, httpRequestDuration, certificatesIssued } = await import("../metrics");

    expect(httpRequestsTotal).toBeDefined();
    expect(httpRequestDuration).toBeDefined();
    expect(certificatesIssued).toBeDefined();
  });
});
