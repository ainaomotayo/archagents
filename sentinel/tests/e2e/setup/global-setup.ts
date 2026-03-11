// tests/e2e/setup/global-setup.ts
import { execSync } from "node:child_process";

const COMPOSE_FILE = "tests/e2e/docker-compose.e2e.yml";
const HEALTH_ENDPOINTS = [
  { name: "api", url: "http://localhost:8081/health" },
  { name: "assessor-worker", url: "http://localhost:9092/health" },
  { name: "agent-security", url: "http://localhost:8082/health" },
  { name: "agent-dependency", url: "http://localhost:8084/health" },
];

async function pollHealth(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 500;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* service not ready */ }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 3000);
  }
  throw new Error(`Health check timed out: ${url}`);
}

export async function setup() {
  if (process.env.E2E_SKIP_DOCKER === "1") {
    console.log("[SETUP] Skipping Docker (E2E_SKIP_DOCKER=1)");
  } else {
    console.log("[SETUP] Starting Docker Compose stack...");
    execSync(`docker compose -f ${COMPOSE_FILE} up -d --build --wait`, {
      stdio: "inherit",
      timeout: 180_000,
    });
  }

  console.log("[SETUP] Waiting for services...");
  await Promise.all(HEALTH_ENDPOINTS.map((ep) =>
    pollHealth(ep.url).then(() => console.log(`[SETUP] ${ep.name}: healthy`))
  ));

  console.log("[SETUP] Running Prisma migrations...");
  execSync(
    `npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma`,
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://sentinel:e2e-test-secret@localhost:5433/sentinel_e2e",
      },
    },
  );

  console.log("[SETUP] Seeding test org and project...");
  // Seed is done via API calls in each test's beforeAll using service objects
  console.log("[SETUP] Ready.");
}

export async function teardown() {
  if (process.env.E2E_SKIP_DOCKER === "1") return;
  console.log("[TEARDOWN] Stopping Docker Compose stack...");
  execSync(`docker compose -f ${COMPOSE_FILE} down -v --remove-orphans`, {
    stdio: "inherit",
    timeout: 60_000,
  });
}
