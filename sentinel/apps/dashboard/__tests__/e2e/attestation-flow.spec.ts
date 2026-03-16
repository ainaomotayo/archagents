import { test, expect } from "@playwright/test";
import { SESSION_COOKIE } from "./e2e-helpers";

/** Ensure session cookie is set then navigate — re-adds cookie before every goto to prevent loss under load */
async function gotoWithAuth(page: import("@playwright/test").Page, url: string, options?: Parameters<typeof page.goto>[1]) {
  await page.context().addCookies([SESSION_COOKIE]);
  await page.goto(url, options);
}

test.describe("Attestation Management Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([SESSION_COOKIE]);
  });

  test("navigates to attestations page from sidebar", async ({ page }) => {
    // Go directly to attestations (/ is auth-protected by middleware)
    await page.goto("/compliance/attestations");
    await expect(page.getByRole("link", { name: "Attestations" })).toBeVisible();
    await expect(page).toHaveURL(/\/compliance\/attestations/);
    await expect(page.locator("h1")).toHaveText("Attestations");
  });

  test("displays attestation list with summary cards", async ({ page }) => {
    await page.goto("/compliance/attestations");
    await expect(page.locator("h1")).toHaveText("Attestations");

    // Summary cards should be visible (use exact to avoid substring matches)
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Expiring Soon", { exact: true })).toBeVisible();
  });

  test("filters attestations by type", async ({ page }) => {
    await page.goto("/compliance/attestations");

    // Click Manual filter
    await page.getByRole("button", { name: "Manual" }).click();
    // Should only show manual attestations
    const cards = page.locator('[class*="animate-fade-up"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("navigates to create new attestation", async ({ page }) => {
    await gotoWithAuth(page, "/compliance/attestations");
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: "New Attestation" });
    const href = await link.getAttribute("href");
    // Re-add cookie before second navigation to prevent loss under parallel load
    await gotoWithAuth(page, href!);
    await expect(page).toHaveURL(/\/compliance\/attestations\/new/);
    await expect(page.getByText("New Attestation")).toBeVisible();
  });

  test("create form: select type and framework/control", async ({ page }) => {
    await page.goto("/compliance/attestations/new");

    // Select manual type (default)
    await expect(page.getByText("Manual Control")).toBeVisible();

    // Select framework
    const frameworkSelect = page.locator('select').first();
    await frameworkSelect.selectOption({ label: "SOC 2 Type II" });

    // Control dropdown should now be populated
    const controlSelect = page.locator('select').nth(1);
    await expect(controlSelect).not.toBeDisabled();
  });

  test("view attestation detail page", async ({ page }) => {
    await gotoWithAuth(page, "/compliance/attestations");
    await page.waitForLoadState("networkidle");

    // Get the href of the first attestation detail link
    const detailLink = page.locator("a[href*='/compliance/attestations/att-']").first();
    await detailLink.waitFor({ state: "visible", timeout: 15_000 });
    const href = await detailLink.getAttribute("href");

    // Re-add cookie before second navigation to prevent loss under parallel load
    await gotoWithAuth(page, href!);
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/compliance\/attestations\/att-/);

    // Should show detail components (generous timeout for slow dev server)
    await expect(page.getByText("Approval Pipeline")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Description")).toBeVisible();
    await expect(page.getByText(/Evidence/)).toBeVisible();
  });

  test("gap analysis page shows attested controls", async ({ page }) => {
    await page.goto("/compliance/gap-analysis");
    await expect(page.locator("h1")).toHaveText("Gap Analysis");

    // The heatmap should render
    const heatmap = page.locator('[role="grid"]');
    await expect(heatmap).toBeVisible();
  });
});
