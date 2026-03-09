import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");

interface ComposeService {
  image?: string;
  build?: { context: string; dockerfile: string; args?: Record<string, string> };
  restart?: string;
  depends_on?: Record<string, { condition: string }>;
  networks?: string[];
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  healthcheck?: {
    test: string[];
    interval: string;
    timeout: string;
    retries: number;
    start_period?: string;
  };
  profiles?: string[];
  command?: string[];
}

interface ComposeFile {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

let compose: ComposeFile;

const REQUIRED_SERVICES = [
  "postgres",
  "redis",
  "api",
  "dashboard",
  "security-agent",
  "license-agent",
  "dependency-agent",
  "ai-detector-agent",
  "quality-agent",
  "policy-agent",
];

const AGENT_SERVICES = [
  "security-agent",
  "license-agent",
  "dependency-agent",
  "ai-detector-agent",
  "quality-agent",
  "policy-agent",
];

beforeAll(() => {
  const raw = readFileSync(
    resolve(ROOT, "docker-compose.sentinel.yml"),
    "utf-8",
  );
  compose = parse(raw) as ComposeFile;
});

describe("docker-compose.sentinel.yml validation", () => {
  it("parses as valid YAML with expected top-level keys", () => {
    expect(compose).toBeDefined();
    expect(compose.services).toBeDefined();
    expect(compose.volumes).toBeDefined();
    expect(compose.networks).toBeDefined();
  });

  it("contains all required services", () => {
    const serviceNames = Object.keys(compose.services);
    for (const name of REQUIRED_SERVICES) {
      expect(serviceNames, `missing service: ${name}`).toContain(name);
    }
  });

  it("every service has a healthcheck", () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      expect(svc.healthcheck, `${name} missing healthcheck`).toBeDefined();
      expect(svc.healthcheck!.test.length).toBeGreaterThan(0);
      expect(svc.healthcheck!.interval).toBeDefined();
      expect(svc.healthcheck!.timeout).toBeDefined();
      expect(svc.healthcheck!.retries).toBeGreaterThanOrEqual(1);
    }
  });

  it("every service has restart: unless-stopped", () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      expect(svc.restart, `${name} missing restart policy`).toBe(
        "unless-stopped",
      );
    }
  });

  it("environment variables reference .env via interpolation syntax", () => {
    const raw = readFileSync(
      resolve(ROOT, "docker-compose.sentinel.yml"),
      "utf-8",
    );
    // Services like api, dashboard, postgres should use ${VAR} syntax
    const envVarPattern = /\$\{[A-Z_]+/g;
    const matches = raw.match(envVarPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(5);
  });

  it("defines sentinel-internal and sentinel-external networks", () => {
    const nets = Object.keys(compose.networks!);
    expect(nets).toContain("sentinel-internal");
    expect(nets).toContain("sentinel-external");
  });

  it("sentinel-internal network is marked internal", () => {
    const internal = compose.networks!["sentinel-internal"] as Record<
      string,
      unknown
    >;
    expect(internal.internal).toBe(true);
  });

  it("agent services only use the internal network", () => {
    for (const name of AGENT_SERVICES) {
      const svc = compose.services[name];
      expect(svc.networks, `${name} networks`).toEqual(["sentinel-internal"]);
    }
  });

  it("api service is on both internal and external networks", () => {
    const api = compose.services.api;
    expect(api.networks).toContain("sentinel-internal");
    expect(api.networks).toContain("sentinel-external");
  });

  it("llm-review-agent is in the llm profile", () => {
    const llm = compose.services["llm-review-agent"];
    expect(llm, "llm-review-agent service should exist").toBeDefined();
    expect(llm.profiles).toContain("llm");
  });

  it("llm-review-agent is NOT in the required services (opt-in only)", () => {
    expect(REQUIRED_SERVICES).not.toContain("llm-review-agent");
    // Verify it has the llm profile so it won't start by default
    const llm = compose.services["llm-review-agent"];
    expect(llm.profiles).toBeDefined();
    expect(llm.profiles!.length).toBeGreaterThan(0);
  });

  it("named volumes are defined for postgres and redis persistence", () => {
    const vols = Object.keys(compose.volumes!);
    expect(vols).toContain("pgdata");
    expect(vols).toContain("redisdata");

    // Postgres uses the pgdata volume
    const pg = compose.services.postgres;
    const pgVolStr = pg.volumes?.join(" ") ?? "";
    expect(pgVolStr).toContain("pgdata");

    // Redis uses the redisdata volume
    const rd = compose.services.redis;
    const rdVolStr = rd.volumes?.join(" ") ?? "";
    expect(rdVolStr).toContain("redisdata");
  });

  it("all agent services depend on redis being healthy", () => {
    const allAgents = [...AGENT_SERVICES, "llm-review-agent"];
    for (const name of allAgents) {
      const svc = compose.services[name];
      expect(svc.depends_on, `${name} depends_on`).toBeDefined();
      expect(
        svc.depends_on!.redis,
        `${name} should depend on redis`,
      ).toBeDefined();
      expect(svc.depends_on!.redis.condition).toBe("service_healthy");
    }
  });
});
