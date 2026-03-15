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
  logging?: {
    driver: string;
    options?: Record<string, string>;
  };
  deploy?: {
    replicas?: number;
    resources?: {
      limits?: { cpus?: string; memory?: string };
    };
  };
}

interface ComposeFile {
  services: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

// ── docker-compose.sentinel.yml (on-prem production) ────────────────────────

let sentinelCompose: ComposeFile;

const SENTINEL_REQUIRED_SERVICES = [
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

const SENTINEL_AGENT_SERVICES = [
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
  sentinelCompose = parse(raw) as ComposeFile;
});

describe("docker-compose.sentinel.yml validation", () => {
  it("parses as valid YAML with expected top-level keys", () => {
    expect(sentinelCompose).toBeDefined();
    expect(sentinelCompose.services).toBeDefined();
    expect(sentinelCompose.volumes).toBeDefined();
    expect(sentinelCompose.networks).toBeDefined();
  });

  it("contains all required services", () => {
    const serviceNames = Object.keys(sentinelCompose.services);
    for (const name of SENTINEL_REQUIRED_SERVICES) {
      expect(serviceNames, `missing service: ${name}`).toContain(name);
    }
  });

  it("every service has a healthcheck", () => {
    for (const [name, svc] of Object.entries(sentinelCompose.services)) {
      expect(svc.healthcheck, `${name} missing healthcheck`).toBeDefined();
      expect(svc.healthcheck!.test.length).toBeGreaterThan(0);
      expect(svc.healthcheck!.interval).toBeDefined();
      expect(svc.healthcheck!.timeout).toBeDefined();
      expect(svc.healthcheck!.retries).toBeGreaterThanOrEqual(1);
    }
  });

  it("every service has restart: unless-stopped", () => {
    for (const [name, svc] of Object.entries(sentinelCompose.services)) {
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
    const envVarPattern = /\$\{[A-Z_]+/g;
    const matches = raw.match(envVarPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(5);
  });

  it("defines sentinel-internal and sentinel-external networks", () => {
    const nets = Object.keys(sentinelCompose.networks!);
    expect(nets).toContain("sentinel-internal");
    expect(nets).toContain("sentinel-external");
  });

  it("sentinel-internal network is marked internal", () => {
    const internal = sentinelCompose.networks!["sentinel-internal"] as Record<
      string,
      unknown
    >;
    expect(internal.internal).toBe(true);
  });

  it("agent services only use the internal network", () => {
    for (const name of SENTINEL_AGENT_SERVICES) {
      const svc = sentinelCompose.services[name];
      expect(svc.networks, `${name} networks`).toEqual(["sentinel-internal"]);
    }
  });

  it("api service is on both internal and external networks", () => {
    const api = sentinelCompose.services.api;
    expect(api.networks).toContain("sentinel-internal");
    expect(api.networks).toContain("sentinel-external");
  });

  it("llm-review-agent is in the llm profile", () => {
    const llm = sentinelCompose.services["llm-review-agent"];
    expect(llm, "llm-review-agent service should exist").toBeDefined();
    expect(llm.profiles).toContain("llm");
  });

  it("llm-review-agent is NOT in the required services (opt-in only)", () => {
    expect(SENTINEL_REQUIRED_SERVICES).not.toContain("llm-review-agent");
    const llm = sentinelCompose.services["llm-review-agent"];
    expect(llm.profiles).toBeDefined();
    expect(llm.profiles!.length).toBeGreaterThan(0);
  });

  it("named volumes are defined for postgres and redis persistence", () => {
    const vols = Object.keys(sentinelCompose.volumes!);
    expect(vols).toContain("pgdata");
    expect(vols).toContain("redisdata");

    const pg = sentinelCompose.services.postgres;
    const pgVolStr = pg.volumes?.join(" ") ?? "";
    expect(pgVolStr).toContain("pgdata");

    const rd = sentinelCompose.services.redis;
    const rdVolStr = rd.volumes?.join(" ") ?? "";
    expect(rdVolStr).toContain("redisdata");
  });

  it("all agent services depend on redis being healthy", () => {
    const allAgents = [...SENTINEL_AGENT_SERVICES, "llm-review-agent"];
    for (const name of allAgents) {
      const svc = sentinelCompose.services[name];
      expect(svc.depends_on, `${name} depends_on`).toBeDefined();
      expect(
        svc.depends_on!.redis,
        `${name} should depend on redis`,
      ).toBeDefined();
      expect(svc.depends_on!.redis.condition).toBe("service_healthy");
    }
  });
});

// ── docker-compose.yml (dev compose) ────────────────────────────────────────

let devCompose: ComposeFile;
let devRaw: string;

// Services from services.yaml that must exist in dev compose
const DEV_CORE_SERVICES = [
  "postgres",
  "redis",
  "api",
  "dashboard",
  "agent-security",
  "agent-dependency",
  "assessor-worker",
  "scheduler",
  "report-worker",
  "notification-worker",
  "github-bridge",
];

const BATCH_AGENTS = [
  "agent-ip-license",
  "agent-quality",
  "agent-ai-detector",
  "agent-policy",
];

const SSO_SERVICES = ["saml-jackson"];

const MONITORING_SERVICES = ["prometheus", "grafana"];

describe("docker-compose.yml (dev) validation", () => {
  beforeAll(() => {
    devRaw = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf-8");
    devCompose = parse(devRaw, { merge: true }) as ComposeFile;
  });

  it("parses as valid YAML", () => {
    expect(devCompose).toBeDefined();
    expect(devCompose.services).toBeDefined();
  });

  it("contains all core services from services.yaml", () => {
    const serviceNames = Object.keys(devCompose.services);
    for (const name of DEV_CORE_SERVICES) {
      expect(serviceNames, `missing core service: ${name}`).toContain(name);
    }
  });

  it("contains all batch agent services", () => {
    const serviceNames = Object.keys(devCompose.services);
    for (const name of BATCH_AGENTS) {
      expect(serviceNames, `missing batch agent: ${name}`).toContain(name);
    }
  });

  it("contains SSO and monitoring services", () => {
    const serviceNames = Object.keys(devCompose.services);
    for (const name of [...SSO_SERVICES, ...MONITORING_SERVICES]) {
      expect(serviceNames, `missing service: ${name}`).toContain(name);
    }
  });

  it("batch agents are in all-agents profile", () => {
    for (const name of BATCH_AGENTS) {
      const svc = devCompose.services[name];
      expect(svc.profiles, `${name} should have profiles`).toBeDefined();
      expect(svc.profiles, `${name} should be in all-agents profile`).toContain(
        "all-agents",
      );
    }
  });

  it("SSO services are in sso profile", () => {
    for (const name of SSO_SERVICES) {
      const svc = devCompose.services[name];
      expect(svc.profiles, `${name} should have profiles`).toBeDefined();
      expect(svc.profiles, `${name} should be in sso profile`).toContain("sso");
    }
  });

  it("monitoring services are in monitoring profile", () => {
    for (const name of MONITORING_SERVICES) {
      const svc = devCompose.services[name];
      expect(svc.profiles, `${name} should have profiles`).toBeDefined();
      expect(svc.profiles, `${name} should be in monitoring profile`).toContain(
        "monitoring",
      );
    }
  });

  it("all services have healthcheck defined", () => {
    for (const [name, svc] of Object.entries(devCompose.services)) {
      expect(svc.healthcheck, `${name} missing healthcheck`).toBeDefined();
      expect(
        svc.healthcheck!.test.length,
        `${name} healthcheck test is empty`,
      ).toBeGreaterThan(0);
      expect(svc.healthcheck!.interval, `${name} missing interval`).toBeDefined();
      expect(svc.healthcheck!.timeout, `${name} missing timeout`).toBeDefined();
      expect(
        svc.healthcheck!.retries,
        `${name} retries should be >= 1`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("core services do NOT have profiles (always start)", () => {
    for (const name of DEV_CORE_SERVICES) {
      const svc = devCompose.services[name];
      expect(svc.profiles, `${name} should not have profiles`).toBeUndefined();
    }
  });

  it("uses YAML anchors for common configuration", () => {
    // The raw YAML should contain anchor definitions
    expect(devRaw).toContain("x-common-env:");
    expect(devRaw).toContain("x-api-image:");
    expect(devRaw).toContain("x-agent-base:");
    // And anchor references
    expect(devRaw).toContain("*common-env");
    expect(devRaw).toContain("*api-image");
    expect(devRaw).toContain("*agent-base");
  });

  it("API has RUN_MIGRATIONS=true in environment", () => {
    const api = devCompose.services.api;
    expect(api.environment).toBeDefined();
    expect((api.environment as Record<string, string>).RUN_MIGRATIONS).toBe(
      "true",
    );
  });

  it("grafana service listens on port 3001", () => {
    const grafana = devCompose.services.grafana;
    expect(grafana).toBeDefined();
    const portsStr = grafana.ports?.join(" ") ?? "";
    expect(portsStr).toContain("3001");
  });

  it("all services have a restart policy", () => {
    for (const [name, svc] of Object.entries(devCompose.services)) {
      expect(svc.restart, `${name} missing restart policy`).toBeDefined();
    }
  });
});

// ── deploy/docker-compose.production.yml (production override) ──────────────

describe("deploy/docker-compose.production.yml validation", () => {
  let prodCompose: ComposeFile;

  beforeAll(() => {
    const raw = readFileSync(
      resolve(ROOT, "deploy/docker-compose.production.yml"),
      "utf-8",
    );
    prodCompose = parse(raw) as ComposeFile;
  });

  it("parses as valid YAML", () => {
    expect(prodCompose).toBeDefined();
    expect(prodCompose.services).toBeDefined();
  });

  it("includes nginx service for TLS termination", () => {
    const nginx = prodCompose.services.nginx;
    expect(nginx, "nginx service should exist").toBeDefined();
    expect(nginx.image).toContain("nginx");
    // Should expose ports 80 and 443
    const portsStr = nginx.ports?.join(" ") ?? "";
    expect(portsStr).toContain("443");
    expect(portsStr).toContain("80");
  });

  it("nginx has a healthcheck", () => {
    const nginx = prodCompose.services.nginx;
    expect(nginx.healthcheck).toBeDefined();
  });

  it("api and dashboard have replicas: 2", () => {
    expect(prodCompose.services.api.deploy?.replicas).toBe(2);
    expect(prodCompose.services.dashboard.deploy?.replicas).toBe(2);
  });

  it("critical agents have replicas: 2", () => {
    expect(
      prodCompose.services["agent-security"].deploy?.replicas,
    ).toBe(2);
    expect(
      prodCompose.services["agent-dependency"].deploy?.replicas,
    ).toBe(2);
  });

  it("all override services have resource limits", () => {
    // Every service in the production override should have deploy.resources.limits
    for (const [name, svc] of Object.entries(prodCompose.services)) {
      expect(
        svc.deploy?.resources?.limits,
        `${name} missing resource limits`,
      ).toBeDefined();
    }
  });

  it("all override services set restart: always", () => {
    for (const [name, svc] of Object.entries(prodCompose.services)) {
      expect(svc.restart, `${name} should have restart: always`).toBe(
        "always",
      );
    }
  });

  it("uses environment variable interpolation", () => {
    const raw = readFileSync(
      resolve(ROOT, "deploy/docker-compose.production.yml"),
      "utf-8",
    );
    const envVarPattern = /\$\{[A-Z_]+/g;
    const matches = raw.match(envVarPattern);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThan(5);
  });

  it("has log rotation configured via YAML anchor", () => {
    const raw = readFileSync(
      resolve(ROOT, "deploy/docker-compose.production.yml"),
      "utf-8",
    );
    // Check the anchor definition exists
    expect(raw).toContain("x-logging:");
    expect(raw).toContain("max-size:");
    expect(raw).toContain("max-file:");
  });
});
