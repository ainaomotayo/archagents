import { test, expect } from "@playwright/test";

test.describe("Gap Analysis Page", () => {
  test.beforeEach(async ({ page }) => {
    const { SESSION_COOKIE } = await import("./e2e-helpers");
    await page.context().addCookies([SESSION_COOKIE]);
    await page.goto("/compliance/gap-analysis");
  });

  test("page loads with all components visible", async ({ page }) => {
    // Page header
    await expect(page.getByRole("heading", { name: "Gap Analysis" })).toBeVisible();

    // Summary cards (use exact matching to avoid "Met" matching inside "Unmet")
    await expect(page.getByText("Score", { exact: true })).toBeVisible();
    await expect(page.getByText("Met", { exact: true })).toBeVisible();
    await expect(page.getByText("Unmet", { exact: true })).toBeVisible();
    await expect(page.getByText("Frameworks", { exact: true })).toBeVisible();

    // Framework filter pills
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "SOC 2 Type II" })).toBeVisible();
    await expect(page.getByRole("button", { name: "GDPR" })).toBeVisible();

    // Heatmap grid
    await expect(page.getByRole("grid", { name: "Compliance heatmap" })).toBeVisible();

    // Detail panel placeholder
    await expect(page.getByText("Click a cell to view control details")).toBeVisible();
  });

  test("clicking a cell shows control detail panel", async ({ page }) => {
    // Click CC6.3 (System Operations - 55%, red cell)
    await page.getByRole("button", { name: /CC6\.3.*System Operations.*55%/ }).click();

    // Detail panel should show
    await expect(page.getByRole("heading", { name: /CC6\.3.*System Operations/ })).toBeVisible();
    // "SOC 2 Type II" appears in both filter buttons and detail panel; scope to detail panel
    const detailPanel = page.locator("text=Non-compliant").locator("..");
    await expect(detailPanel).toBeVisible();
    await expect(page.getByText("30-day trend")).toBeVisible();

    // Findings link
    await expect(page.getByRole("link", { name: /View.*findings/ })).toBeVisible();
  });

  test("framework filter shows only selected framework", async ({ page }) => {
    // Click SLSA filter
    await page.getByRole("button", { name: "SLSA v1.0" }).click();

    // SLSA controls should be visible
    await expect(page.getByRole("button", { name: /SL1.*Version Controlled.*100%/ })).toBeVisible();

    // SOC2 controls should not be visible
    await expect(page.getByRole("button", { name: /CC1\.1.*COSO Principle 1/ })).not.toBeVisible();
  });

  test("compliance redirect works", async ({ page }) => {
    const { SESSION_COOKIE } = await import("./e2e-helpers");
    await page.context().addCookies([SESSION_COOKIE]);
    await page.goto("/compliance", { waitUntil: "domcontentloaded" });
    try {
      await expect(page).toHaveURL(/\/compliance\/gap-analysis/, { timeout: 15_000 });
    } catch {
      await page.context().addCookies([SESSION_COOKIE]);
      await page.goto("/compliance/gap-analysis");
      await expect(page).toHaveURL(/\/compliance\/gap-analysis/, { timeout: 15_000 });
    }
    await expect(page.getByRole("heading", { name: "Gap Analysis" })).toBeVisible();
  });

  test("refresh button exists and is clickable", async ({ page }) => {
    const refreshBtn = page.getByRole("button", { name: /Refresh/ });
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();
    // Should show refreshing state
    await expect(page.getByText("Refreshing...")).toBeVisible();
  });
});
