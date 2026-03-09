import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readK6Script(): string {
  return readFileSync(join(__dirname, "k6-scan-load.js"), "utf-8");
}

function readK6Config(): Record<string, unknown> {
  const raw = readFileSync(join(__dirname, "k6-config.json"), "utf-8");
  return JSON.parse(raw);
}

describe("k6 load test script", () => {
  const script = readK6Script();

  it("imports required k6 modules", () => {
    expect(script).toContain('from "k6/http"');
    expect(script).toContain('from "k6"');
  });

  it("exports options with scenarios", () => {
    expect(script).toContain("export const options");
    expect(script).toContain("scenarios");
    expect(script).toContain("scan_submissions");
    expect(script).toContain("poll_results");
  });

  it("defines scan_submissions scenario with 100 VUs", () => {
    expect(script).toContain("vus: 100");
    expect(script).toContain('"5m"');
  });

  it("defines poll_results scenario starting after 30s", () => {
    expect(script).toContain("vus: 50");
    expect(script).toContain('startTime: "30s"');
  });

  it("configures p95 latency threshold under 2s", () => {
    expect(script).toContain("p(95)<2000");
  });

  it("configures error rate threshold under 1%", () => {
    expect(script).toContain("rate<0.01");
  });

  it("configures checks threshold above 99%", () => {
    expect(script).toContain("rate>0.99");
  });

  it("exports a default function", () => {
    expect(script).toContain("export default function");
  });

  it("has submitScan function that POSTs to /api/v1/scans", () => {
    expect(script).toContain("export function submitScan");
    expect(script).toContain("/api/v1/scans");
    expect(script).toContain("http.post");
  });

  it("has pollResults function that GETs scan status", () => {
    expect(script).toContain("export function pollResults");
    expect(script).toContain("http.get");
  });

  it("includes proper checks for responses", () => {
    expect(script).toContain("check(res");
  });
});

describe("k6 config", () => {
  const config = readK6Config();

  it("has smoke, load, stress, and soak scenarios", () => {
    const scenarios = config.scenarios as Record<string, unknown>;
    expect(scenarios).toHaveProperty("smoke");
    expect(scenarios).toHaveProperty("load");
    expect(scenarios).toHaveProperty("stress");
    expect(scenarios).toHaveProperty("soak");
  });

  it("smoke scenario uses low VU count", () => {
    const scenarios = config.scenarios as Record<
      string,
      { scenarios: Record<string, { vus: number }> }
    >;
    expect(scenarios.smoke.scenarios.scan_submissions.vus).toBeLessThanOrEqual(
      10,
    );
  });

  it("stress scenario uses ramping-vus executor", () => {
    const scenarios = config.scenarios as Record<
      string,
      { scenarios: Record<string, { executor: string }> }
    >;
    expect(scenarios.stress.scenarios.scan_submissions.executor).toBe(
      "ramping-vus",
    );
  });

  it("has default baseUrl and token", () => {
    const defaults = config.defaults as Record<string, string>;
    expect(defaults.baseUrl).toBeDefined();
    expect(defaults.token).toBeDefined();
  });
});
