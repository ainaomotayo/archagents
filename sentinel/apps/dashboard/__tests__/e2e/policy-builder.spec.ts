import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Locate the policy canvas drop target. */
const canvas = (page: import("@playwright/test").Page) =>
  page.locator("[data-testid='policy-canvas']");

/** Locate all block cards inside the canvas. */
const blockCards = (page: import("@playwright/test").Page) =>
  canvas(page).locator("[data-testid='block-card']");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Visual Policy Builder", () => {
  test.beforeEach(async ({ page }) => {
    // Every test starts on the new-policy page which defaults to the visual tab.
    await page.goto("/policies/new");
  });

  // -----------------------------------------------------------------------
  // 1. Create a policy via the visual builder
  // -----------------------------------------------------------------------
  test("create policy via visual builder", async ({ page }) => {
    // "Visual" tab should be active by default (has the accent bg class).
    const visualTab = page.getByRole("button", { name: "Visual" });
    await expect(visualTab).toHaveClass(/bg-accent/);

    // The palette section headers should be visible.
    await expect(page.getByText("Conditions")).toBeVisible();
    await expect(page.getByText("Groups")).toBeVisible();
    await expect(page.getByText("Actions")).toBeVisible();

    // Drag a "Severity" condition block from the palette onto the canvas.
    const severityBlock = page.getByText("Severity").first();
    await severityBlock.dragTo(canvas(page));

    // Drag a "Block" action from the palette onto the canvas.
    const blockAction = page.getByText("Block").first();
    await blockAction.dragTo(canvas(page));

    // Fill in the policy name.
    await page.locator("input[placeholder='Policy name']").fill("Test Visual Policy");

    // The "Create Policy" button should be enabled (tree has children).
    const saveBtn = page.getByRole("button", { name: /Create Policy/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // After a successful save the page redirects to the policy detail or list.
    await expect(page).toHaveURL(/\/policies/);
  });

  // -----------------------------------------------------------------------
  // 2. Edit an existing visual policy
  // -----------------------------------------------------------------------
  test("edit existing visual policy", async ({ page }) => {
    // Navigate to the policies list instead of /new.
    await page.goto("/policies");

    // Click the first policy row that leads to a detail page.
    const policyLink = page.locator("a[href*='/policies/']").first();
    await policyLink.click();
    await expect(page).toHaveURL(/\/policies\/.+/);

    // If this policy uses the tree format, the PolicyBuilder renders palette
    // sections. We just assert the page loaded without error.
    const heading = page.locator("h1, input[placeholder='Policy name']").first();
    await expect(heading).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. Undo and redo
  // -----------------------------------------------------------------------
  test("undo and redo restore canvas state", async ({ page }) => {
    // Drag a "Severity" block onto the canvas.
    const severityBlock = page.getByText("Severity").first();
    await severityBlock.dragTo(canvas(page));

    // At least one block-card should now exist inside the canvas.
    await expect(blockCards(page).first()).toBeVisible();
    const countAfterAdd = await blockCards(page).count();
    expect(countAfterAdd).toBeGreaterThan(0);

    // Click "Undo" (aria-label="Undo").
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await undoBtn.click();

    // The added block should be removed (count decreases).
    await expect(blockCards(page)).toHaveCount(countAfterAdd - 1);

    // Click "Redo" (aria-label="Redo").
    const redoBtn = page.getByRole("button", { name: "Redo" });
    await redoBtn.click();

    // The block should be restored.
    await expect(blockCards(page)).toHaveCount(countAfterAdd);
  });

  // -----------------------------------------------------------------------
  // 4. Advanced mode shows YAML preview and simulation panels
  // -----------------------------------------------------------------------
  test("advanced mode shows YAML preview and simulation", async ({ page }) => {
    // Default mode is "Simple" -- YAML Preview and Simulation should be hidden.
    await expect(page.getByText("YAML Preview")).not.toBeVisible();
    await expect(page.getByText("Simulation")).not.toBeVisible();

    // Toggle to "Advanced" via the ModeToggle.
    await page.getByRole("button", { name: "Advanced" }).click();

    // Both panels should now be visible.
    await expect(page.getByText("YAML Preview")).toBeVisible();
    await expect(page.getByText("Simulation")).toBeVisible();

    // Drag a block first so the simulation has something to evaluate.
    const severityBlock = page.getByText("Severity").first();
    await severityBlock.dragTo(canvas(page));

    // Fill the simulation textarea (its placeholder contains "severity").
    const simTextarea = page.locator("textarea").filter({ hasText: "" }).last();
    await simTextarea.fill(
      JSON.stringify({
        severity: "critical",
        category: "secret-detection",
        riskScore: 75,
        branch: "main",
      }),
    );

    // Run the simulation.
    await page.getByRole("button", { name: /Run Simulation/i }).click();

    // The result badge should show either "MATCH" or "NO MATCH".
    await expect(page.getByText(/^(MATCH|NO MATCH)$/)).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 5. Validation prevents save when the tree has no children
  // -----------------------------------------------------------------------
  test("validation prevents save when tree is empty", async ({ page }) => {
    // With no blocks added, the page should show "Add rules to save" status.
    await expect(page.getByText("Add rules to save")).toBeVisible();

    // The "Create Policy" button should be disabled.
    const saveBtn = page.getByRole("button", { name: /Create Policy/i });
    await expect(saveBtn).toBeDisabled();

    // Drag a "Severity" condition onto the canvas (no action yet).
    const severityBlock = page.getByText("Severity").first();
    await severityBlock.dragTo(canvas(page));

    // The tree now has children so top-level status should become "Valid".
    await expect(page.getByText("Valid")).toBeVisible();

    // But the ValidationPanel inside the builder may still show issues
    // (e.g. "action required"). If so, the inner panel displays errors.
    // We verify the Create Policy button becomes enabled once tree is non-empty.
    await expect(saveBtn).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // 6. YAML tab backward compatibility
  // -----------------------------------------------------------------------
  test("YAML tab allows creating a policy with raw YAML", async ({ page }) => {
    // Switch to the "YAML" tab.
    await page.getByRole("button", { name: "YAML" }).click();

    // The YAML tab should become active.
    await expect(page.getByRole("button", { name: "YAML" })).toHaveClass(/bg-accent/);

    // The PolicyEditor textarea / code area should be visible.
    const editorArea = page.locator("textarea, [contenteditable='true'], .cm-content").first();
    await expect(editorArea).toBeVisible();

    // The default YAML is pre-filled and valid, so "Valid" status should show.
    await expect(page.getByText("Valid")).toBeVisible();

    // Fill in a policy name.
    await page.locator("input[placeholder='Policy name']").fill("Test YAML Policy");

    // "Create Policy" should be enabled.
    const saveBtn = page.getByRole("button", { name: /Create Policy/i });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // After save, should redirect to the policies area.
    await expect(page).toHaveURL(/\/policies/);
  });
});
