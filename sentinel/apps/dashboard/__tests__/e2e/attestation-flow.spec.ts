import { test, expect } from "@playwright/test";

test.describe("Attestation Management Flow", () => {
  test("navigates to attestations page from sidebar", async ({ page }) => {
    await page.goto("/");
    await page.click('text=Attestations');
    await expect(page).toHaveURL(/\/compliance\/attestations/);
    await expect(page.locator("h1")).toHaveText("Attestations");
  });

  test("displays attestation list with summary cards", async ({ page }) => {
    await page.goto("/compliance/attestations");
    await expect(page.locator("h1")).toHaveText("Attestations");

    // Summary cards should be visible
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Approved")).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();
    await expect(page.getByText("Expiring Soon")).toBeVisible();
  });

  test("filters attestations by type", async ({ page }) => {
    await page.goto("/compliance/attestations");

    // Click Manual filter
    await page.click('button:has-text("Manual")');
    // Should only show manual attestations
    const cards = page.locator('[class*="animate-fade-up"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("navigates to create new attestation", async ({ page }) => {
    await page.goto("/compliance/attestations");
    await page.click('text=New Attestation');
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

    // Click View on first attestation
    await page.click('text=View >> nth=0');
    await expect(page).toHaveURL(/\/compliance\/attestations\/att-/);

    // Should show detail components
    await expect(page.getByText("Approval Pipeline")).toBeVisible();
    await expect(page.getByText("Description")).toBeVisible();
    await expect(page.getByText("Evidence")).toBeVisible();
  });

  test("gap analysis page shows attested controls", async ({ page }) => {
    await page.goto("/compliance/gap-analysis");
    await expect(page.locator("h1")).toHaveText("Gap Analysis");

    // The heatmap should render
    const heatmap = page.locator('[role="grid"]');
    await expect(heatmap).toBeVisible();
  });
});
