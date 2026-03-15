import { test, expect } from "@playwright/test";

test.describe("Compliance Wizard – List Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/compliance/wizards");
  });

  test("page loads with heading and create button", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Compliance Wizards", exact: true })).toBeVisible();
    await expect(page.getByText("Step-by-step EU AI Act compliance guidance")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create Wizard" })).toBeVisible();
  });

  test("empty state shows create CTA when no wizards exist", async ({ page }) => {
    // Page either shows a table (wizards exist) or the empty state
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (!hasTable) {
      await expect(page.getByText("No compliance wizards yet")).toBeVisible();
      await expect(page.getByRole("link", { name: "Create Your First Wizard" })).toBeVisible();
    }
  });

  test("table headers are present when wizards exist", async ({ page }) => {
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    if (hasTable) {
      await expect(page.getByRole("columnheader", { name: /Name/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Framework/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Progress/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Status/i })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: /Created/i })).toBeVisible();
    }
  });

  test("create wizard link navigates to /compliance/wizards/new", async ({ page }) => {
    await page.getByRole("link", { name: "Create Wizard" }).first().click();
    await page.waitForURL("**/compliance/wizards/new");
    await expect(page.getByRole("heading", { name: "Create Compliance Wizard" })).toBeVisible();
  });
});

test.describe("Compliance Wizard – Create Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/compliance/wizards/new", { waitUntil: "domcontentloaded" });
  });

  test("form renders with all fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create Compliance Wizard" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Q1 2026 AI System Assessment")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Customer Risk Scoring Engine")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Acme Corp")).toBeVisible();
    await expect(page.getByText("EU AI Act")).toBeVisible();
    await expect(page.getByText("12 controls across 4 phases")).toBeVisible();
  });

  test("shows framework badge as EU AI Act", async ({ page }) => {
    await expect(page.getByText("EU AI Act")).toBeVisible();
  });

  test("submit with empty name shows validation error", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const nameInput = page.getByPlaceholder("e.g. Q1 2026 AI System Assessment");
    await nameInput.pressSequentially("x", { delay: 50 });
    await nameInput.press("Backspace");
    await page.getByRole("button", { name: "Create Wizard" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();
  });

  test("cancel link navigates back to wizard list", async ({ page }) => {
    await page.getByRole("link", { name: "Cancel" }).click();
    await page.waitForURL("**/compliance/wizards");
    await expect(page.getByRole("heading", { name: "Compliance Wizards", exact: true })).toBeVisible();
  });

  test("create button text and disabled state", async ({ page }) => {
    const createBtn = page.getByRole("button", { name: "Create Wizard" });
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toBeEnabled();
  });
});
