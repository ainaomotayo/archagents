import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: process.env.CI ? 2 : 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npx tsx ./__tests__/e2e/mock-wizard-api.ts",
      port: 8081,
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      command: "SENTINEL_API_URL=http://localhost:8081 NEXTAUTH_SECRET=e2e-test-secret NEXTAUTH_URL=http://localhost:3000 npm run dev",
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
