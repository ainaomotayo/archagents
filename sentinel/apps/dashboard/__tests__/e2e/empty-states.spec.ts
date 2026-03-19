import { test, expect } from "@playwright/test";

const SESSION_COOKIE = {
  name: "next-auth.session-token",
  value: "e2e-test-session",
  domain: "localhost",
  path: "/",
};

test.describe("Empty states — new org", () => {
  test.beforeEach(async ({ page }) => {
    // Set session cookie to simulate an authenticated user
    await page.context().addCookies([SESSION_COOKIE]);

    // Mock all API routes to return empty data (simulating a new org)
    await Promise.all([
      page.route("**/v1/scans**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ scans: [], total: 0 }),
        })
      ),
      page.route("**/v1/findings**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ findings: [], total: 0 }),
        })
      ),
      page.route("**/v1/certificates**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ certificates: [], total: 0 }),
        })
      ),
      page.route("**/v1/projects**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        })
      ),
      page.route("**/v1/approvals/stats**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            pending: 0,
            escalated: 0,
            decidedToday: 0,
            avgDecisionTimeHours: 0,
            expiringSoon: 0,
          }),
        })
      ),
      page.route("**/v1/compliance/scores**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ frameworks: [] }),
        })
      ),
      page.route("**/v1/ai-metrics/stats**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ hasData: false, stats: {}, toolBreakdown: [] }),
        })
      ),
    ]);
  });

  test("overview page shows onboarding banner when no scans", async ({
    page,
  }) => {
    await page.goto("/");
    // Should show welcome banner
    await expect(page.getByText("Welcome to SENTINEL")).toBeVisible();
    const ctaLink = page.getByRole("link", { name: /connect your first repository/i });
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute("href", "/settings/vcs");
    // Should NOT show stale mock org data
    await expect(page.getByText("acme")).not.toBeVisible();
    // Should show product explainer
    await expect(page.getByText("Certify")).toBeVisible();
  });

  test("projects page shows empty state CTA when no projects", async ({
    page,
  }) => {
    await page.goto("/projects");
    await expect(
      page.getByText("No repositories monitored yet")
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /go to integrations/i })
    ).toBeVisible();
  });

  test("findings page shows success empty state when no findings", async ({
    page,
  }) => {
    await page.goto("/findings");
    await expect(
      page.getByText("No open findings — your codebase is clean")
    ).toBeVisible();
  });

  test("certificates page shows empty state when no certificates", async ({
    page,
  }) => {
    await page.goto("/certificates");
    await expect(
      page.getByText("No certificates issued yet")
    ).toBeVisible();
  });
});
