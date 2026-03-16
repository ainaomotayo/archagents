import { test, expect } from "@playwright/test";

test.describe("Attestation Management Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Some attestation sub-pages check auth at the page level (getServerSession).
    // Set a fake session cookie so the middleware and page-level checks allow access.
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "e2e-test-session",
        domain: "localhost",
        path: "/",
      },
    ]);
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
    await page.goto("/compliance/attestations");
    await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: "New Attestation" });
    const href = await link.getAttribute("href");
    await page.goto(href!);
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
    await page.goto("/compliance/attestations");
    await page.waitForLoadState("networkidle");

    // Get the href of the first attestation detail link
    const detailLink = page.locator("a[href*='/compliance/attestations/att-']").first();
    await detailLink.waitFor({ state: "visible" });
    const href = await detailLink.getAttribute("href");

    // Navigate directly to the detail page (click + client routing is unreliable under load)
    await page.goto(href!);
    await expect(page).toHaveURL(/\/compliance\/attestations\/att-/);

    // Should show detail components
    await expect(page.getByText("Approval Pipeline")).toBeVisible();
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
