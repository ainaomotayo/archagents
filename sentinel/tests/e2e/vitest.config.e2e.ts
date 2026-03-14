// tests/e2e/vitest.config.e2e.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "tests/e2e",
    include: ["__tests__/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 90_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    globalSetup: ["./setup/global-setup.ts"],
    env: {
      E2E_API_URL: "http://localhost:8081",
      E2E_REDIS_URL: "redis://localhost:6380",
      E2E_DB_URL: "postgresql://sentinel:e2e-test-secret@localhost:5433/sentinel_e2e",
      E2E_SECRET: "e2e-test-secret",
      E2E_ORG_ID: "org-e2e-test",
      E2E_PROJECT_ID: "proj-e2e-test",
      E2E_SCHEDULER_URL: "http://localhost:9091",
    },
  },
});
