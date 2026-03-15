import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { parse } from "yaml";
import { readFileSync } from "fs";

const ROOT = __dirname + "/..";

function compose(cmd: string): string {
  return execSync(`docker compose -f ../docker-compose.yml ${cmd}`, {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 60_000,
  });
}

describe("Deployment Integration Tests", () => {
  // These tests require Docker to be running
  // Skip in CI unless INTEGRATION_TESTS=true
  const skip = process.env.INTEGRATION_TESTS !== "true";

  it.skipIf(skip)("docker-compose.yml is valid", () => {
    const output = compose("config --quiet 2>&1");
    expect(output).toBe("");
  });

  it("services.yaml is valid YAML", () => {
    const doc = parse(readFileSync(ROOT + "/services.yaml", "utf-8"));
    expect(Object.keys(doc.services).length).toBeGreaterThanOrEqual(17);
    expect(Object.keys(doc.infrastructure).length).toBe(2);
  });

  it("all catalog services have health checks", () => {
    const doc = parse(readFileSync(ROOT + "/services.yaml", "utf-8"));
    for (const [name, svc] of Object.entries(doc.services) as any[]) {
      expect(svc.healthCheck, `${name} missing healthCheck`).toBeDefined();
    }
  });

  it("Helm values define all expected workers", () => {
    const values = parse(readFileSync(ROOT + "/helm/values.yaml", "utf-8"));
    expect(values.workers.assessor).toBeDefined();
    expect(values.workers.scheduler).toBeDefined();
    expect(values.workers.report).toBeDefined();
    expect(values.workers.notification).toBeDefined();
    expect(values.workers.githubBridge).toBeDefined();
  });

  it("Helm values define critical and batch agents", () => {
    const values = parse(readFileSync(ROOT + "/helm/values.yaml", "utf-8"));
    expect(values.agents.critical.security.enabled).toBe(true);
    expect(values.agents.critical.dependency.enabled).toBe(true);
    expect(values.agents.batch.ipLicense).toBeDefined();
    expect(values.agents.batch.quality).toBeDefined();
    expect(values.agents.batch.aiDetector).toBeDefined();
    expect(values.agents.batch.policy).toBeDefined();
  });
});
