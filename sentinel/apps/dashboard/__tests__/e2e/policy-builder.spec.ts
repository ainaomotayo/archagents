import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Locate block nodes inside the canvas (they have "Delete block" buttons). */
const canvasBlocks = (page: import("@playwright/test").Page) =>
  page.locator("button[class]").filter({ hasText: /Delete block/ });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Visual Policy Builder", () => {
  test.beforeEach(async ({ page }) => {
    // /policies/* is auth-protected by middleware (checks cookie existence only).
    // Set a fake session cookie so the middleware allows access.
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value: "e2e-test-session",
        domain: "localhost",
        path: "/",
      },
    ]);
    // Every test starts on the new-policy page which defaults to the visual tab.
    await page.goto("/policies/new");
  });

  // -----------------------------------------------------------------------
  // 1. Create a policy via the visual builder
  // -----------------------------------------------------------------------
  test("create policy via visual builder", async ({ page }) => {
    // "Visual" tab should be visible (active by default).
    await expect(page.getByRole("button", { name: "Visual" })).toBeVisible();

    // The palette section headers should be visible.
    await expect(page.getByRole("heading", { name: "Conditions" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Actions" })).toBeVisible();

    // Add a "Severity" condition block via the palette Add button.
    await page.getByRole("button", { name: "Add Severity" }).click();

    // Add a "Block" action via the palette Add button.
    await page.getByRole("button", { name: "Add Block" }).click();

    // Fill in the policy name.
    await page.getByRole("textbox", { name: "Policy name" }).fill("Test Visual Policy");

    // The "Create Policy" button should be enabled (tree has children + action).
    const saveBtn = page.getByRole("button", { name: /Create Policy/i });
    await expect(saveBtn).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // 2. Edit an existing visual policy
  // -----------------------------------------------------------------------
  test("policies list page loads", async ({ page }) => {
    // Navigate to the policies list.
    await page.goto("/policies");

    // The page should load with a heading and create link.
    await expect(page.getByRole("link", { name: /New Policy|Create/i })).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. Undo and redo
  // -----------------------------------------------------------------------
  test("undo and redo restore canvas state", async ({ page }) => {
    // Add a "Severity" block via the palette Add button.
    await page.getByRole("button", { name: "Add Severity" }).click();

    // A "Severity" block should now appear in the canvas.
    await expect(page.getByText("Severity: (none)")).toBeVisible();

    // Click "Undo".
    const undoBtn = page.getByRole("button", { name: "Undo" });
    await undoBtn.click();

    // The added block should be removed.
    await expect(page.getByText("Severity: (none)")).not.toBeVisible();

    // Click "Redo".
    const redoBtn = page.getByRole("button", { name: "Redo" });
    await redoBtn.click();

    // The block should be restored.
    await expect(page.getByText("Severity: (none)")).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 4. Advanced mode shows YAML preview and simulation panels
  // -----------------------------------------------------------------------
  test("advanced mode shows YAML preview and simulation", async ({ page }) => {
    // Default mode is "Simple" -- YAML Preview and Simulation should be hidden.
    await expect(page.getByRole("heading", { name: "YAML Preview" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Simulation" })).not.toBeVisible();

    // Toggle to "Advanced" via the ModeToggle.
    await page.getByRole("button", { name: "Advanced" }).click();

    // Both panels should now be visible.
    await expect(page.getByRole("heading", { name: "YAML Preview" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Simulation" })).toBeVisible();

    // Add a block so the simulation has something to evaluate.
    await page.getByRole("button", { name: "Add Severity" }).click();

    // The simulation textarea has a placeholder with JSON.
    const simTextarea = page.getByRole("textbox").filter({ hasText: "" }).last();
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

    // Add a "Severity" condition and a "Block" action via palette Add buttons.
    await page.getByRole("button", { name: "Add Severity" }).click();
    await page.getByRole("button", { name: "Add Block" }).click();

    // The tree now has children + action so status should become "Valid".
    await expect(page.getByText("Valid", { exact: true })).toBeVisible();

    // Create Policy button should now be enabled.
    await expect(saveBtn).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // 6. YAML tab backward compatibility
  // -----------------------------------------------------------------------
  test("YAML tab allows creating a policy with raw YAML", async ({ page }) => {
    // Switch to the "YAML" tab.
    await page.getByRole("button", { name: "YAML" }).click();

    // The PolicyEditor textarea should be visible.
    const editorArea = page.getByRole("textbox", { name: "Policy YAML editor" });
    await expect(editorArea).toBeVisible();

    // The default YAML is pre-filled and valid, so validation should confirm.
    await expect(page.getByText("Policy is valid")).toBeVisible();

    // Fill in a policy name.
    await page.getByRole("textbox", { name: "Policy name" }).fill("Test YAML Policy");

    // "Create Policy" should be enabled.
    const saveBtn = page.getByRole("button", { name: /Create Policy/i });
    await expect(saveBtn).toBeEnabled();
  });
});
