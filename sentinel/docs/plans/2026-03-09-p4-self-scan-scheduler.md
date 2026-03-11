# Self-Scan Scheduler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the existing self-scan configuration into a working cron scheduler that triggers scans on a schedule via the EventBus.

**Architecture:** Create a standalone scheduler process (`apps/api/src/scheduler.ts`) that reads `SELF_SCAN_CONFIG`, parses cron expressions, and publishes `sentinel.diffs` events on schedule. Uses `node-cron` for cron parsing. Runs as a separate container/process alongside the API and worker. Includes Prometheus metrics for scheduler health.

**Tech Stack:** TypeScript, node-cron, Redis EventBus, Prometheus metrics

---

### Task 1: Add node-cron Dependency and Create Scheduler Module

**Files:**
- Modify: `apps/api/package.json` (add node-cron dependency)
- Create: `apps/api/src/scheduler.ts`
- Test: `apps/api/src/__tests__/scheduler.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/__tests__/scheduler.test.ts`:

```typescript
import { describe, test, expect, vi } from "vitest";
import { buildSchedulerConfig, shouldTriggerScan } from "../scheduler.js";

describe("scheduler", () => {
  test("buildSchedulerConfig returns valid config from SELF_SCAN_CONFIG", () => {
    const config = buildSchedulerConfig();
    expect(config.schedule).toBe("0 2 * * *");
    expect(config.targets.length).toBeGreaterThan(0);
    expect(config.enabled).toBe(true);
  });

  test("buildSchedulerConfig can be disabled via env var", () => {
    process.env.SELF_SCAN_ENABLED = "false";
    const config = buildSchedulerConfig();
    expect(config.enabled).toBe(false);
    delete process.env.SELF_SCAN_ENABLED;
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
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: FAIL (module not found)

**Step 3: Install node-cron**

Run: `cd apps/api && pnpm add node-cron && pnpm add -D @types/node-cron`

**Step 4: Create scheduler module**

Create `apps/api/src/scheduler.ts`:

```typescript
import cron from "node-cron";
import { Redis } from "ioredis";
import { EventBus } from "@sentinel/events";
import { SELF_SCAN_CONFIG, validateSelfScanConfig } from "@sentinel/security";
import { createLogger } from "@sentinel/telemetry";

const logger = createLogger({ name: "sentinel-scheduler" });

export interface SchedulerConfig {
  schedule: string;
  cveRescanSchedule: string;
  targets: string[];
  policyPath: string;
  notifyOnFailure: boolean;
  cveRescanEnabled: boolean;
  enabled: boolean;
}

export function buildSchedulerConfig(): SchedulerConfig {
  const enabled = process.env.SELF_SCAN_ENABLED !== "false";
  return {
    ...SELF_SCAN_CONFIG,
    enabled,
  };
}

export function shouldTriggerScan(config: SchedulerConfig): boolean {
  if (!config.enabled) return false;
  const validation = validateSelfScanConfig(config);
  return validation.valid;
}

async function triggerSelfScan(eventBus: EventBus, config: SchedulerConfig) {
  const scanPayload = {
    projectId: "self-scan",
    commitHash: `scheduled-${Date.now()}`,
    branch: "main",
    author: "sentinel-scheduler",
    timestamp: new Date().toISOString(),
    files: [],
    toolHints: { tool: "sentinel-self-scan", markers: [] },
    scanConfig: {
      securityLevel: "strict" as const,
      licensePolicy: "default",
      qualityThreshold: 80,
    },
    selfScan: true,
    targets: config.targets,
    policyPath: config.policyPath,
  };

  await eventBus.publish("sentinel.diffs", {
    scanId: `self-scan-${Date.now()}`,
    payload: scanPayload,
    submittedAt: new Date().toISOString(),
    triggeredBy: "scheduler",
  });

  logger.info({ targets: config.targets }, "Self-scan triggered");
}

// --- Main entrypoint (when run as standalone process) ---
if (process.env.NODE_ENV !== "test") {
  const config = buildSchedulerConfig();

  if (!shouldTriggerScan(config)) {
    logger.warn("Self-scan scheduler disabled or config invalid, exiting");
    process.exit(0);
  }

  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const eventBus = new EventBus(redis);

  logger.info({ schedule: config.schedule }, "Starting self-scan scheduler");

  cron.schedule(config.schedule, async () => {
    try {
      await triggerSelfScan(eventBus, config);
    } catch (err) {
      logger.error({ err }, "Failed to trigger self-scan");
    }
  });

  if (config.cveRescanEnabled) {
    logger.info({ schedule: config.cveRescanSchedule }, "Starting CVE rescan scheduler");
    cron.schedule(config.cveRescanSchedule, async () => {
      try {
        await triggerSelfScan(eventBus, { ...config, targets: config.targets });
        logger.info("CVE rescan triggered");
      } catch (err) {
        logger.error({ err }, "Failed to trigger CVE rescan");
      }
    });
  }

  const shutdown = async () => {
    logger.info("Scheduler shutting down...");
    await eventBus.disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("Self-scan scheduler running");
}
```

**Step 5: Run tests**

Run: `cd apps/api && npx vitest run src/__tests__/scheduler.test.ts`
Expected: PASS

**Step 6: Run all API tests**

Run: `cd apps/api && npx vitest run`
Expected: All PASS

**Step 7: Commit**

```bash
git add apps/api/package.json apps/api/src/scheduler.ts apps/api/src/__tests__/scheduler.test.ts pnpm-lock.yaml
git commit -m "feat: add self-scan scheduler with cron-based triggering"
```

---

### Task 2: Add Scheduler to Docker Compose and Deployment Config

**Files:**
- Modify: `docker-compose.sentinel.yml` (add scheduler service)
- Modify: `docker-compose.yml` (add scheduler service for dev)
- Modify: `.env.example` (add SELF_SCAN_ENABLED)

**Step 1: Add scheduler service to docker-compose.sentinel.yml**

After the `assessor-worker` service, add:

```yaml
  scheduler:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - sentinel-internal
    environment:
      REDIS_URL: ${REDIS_URL}
      SELF_SCAN_ENABLED: ${SELF_SCAN_ENABLED:-true}
      NODE_ENV: production
    command: ["node", "apps/api/dist/scheduler.js"]
```

**Step 2: Add to docker-compose.yml (dev)**

Similar entry with dev defaults.

**Step 3: Add env var to .env.example**

Add under API section:
```
SELF_SCAN_ENABLED=true
```

**Step 4: Commit**

```bash
git add docker-compose.sentinel.yml docker-compose.yml .env.example
git commit -m "feat: add scheduler service to Docker Compose configs"
```
