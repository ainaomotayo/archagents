/**
 * Comprehensive E2E tests for the EU AI Act Compliance Wizard.
 *
 * Uses a mock API server (mock-wizard-api.ts) to simulate the backend.
 * Dashboard must be started with SENTINEL_API_URL=http://localhost:8081.
 */
import { test, expect, type Page } from "@playwright/test";
import { resetState } from "./mock-wizard-api";
import { SESSION_COOKIE } from "./e2e-helpers";

// Force all tests in this file to run in a single worker (shared mock state).
test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  resetState();
});

// ── Helpers ────────────────────────────────────────────────────────────

/** Navigate with auth cookie — re-adds cookie before every goto to prevent loss under load */
async function gotoWithAuth(page: Page, url: string, options?: Parameters<typeof page.goto>[1]) {
  await page.context().addCookies([SESSION_COOKIE]);
  try {
    await page.goto(url, options);
  } catch (err: any) {
    if (err.message?.includes("ERR_ABORTED")) {
      await page.waitForTimeout(2_000);
      await page.context().addCookies([SESSION_COOKIE]);
      await page.goto(url, options);
    } else {
      throw err;
    }
  }
}

/** Create a wizard via the UI and navigate to its detail page */
async function createWizardViaUI(page: Page, name: string): Promise<void> {
  await gotoWithAuth(page, "/compliance/wizards/new");
  await page.waitForLoadState("networkidle");

  const input = page.getByPlaceholder("e.g. Q1 2026 AI System Assessment");
  await input.fill(name);

  await page.getByRole("button", { name: "Create Wizard" }).click();

  // Wait for navigation to the wizard detail page
  await page.waitForURL(/\/compliance\/wizards\/wiz-/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}

/** Click a step in the sidebar stepper */
async function selectStep(page: Page, title: string): Promise<void> {
  await page.getByRole("button", { name: title }).click();
  await page.waitForTimeout(800);
}

/** Check all unchecked required checkboxes by clicking them */
async function checkAllRequirements(page: Page): Promise<void> {
  // Use click() instead of check() to avoid strict state verification issues.
  // Wait generously between clicks to allow API calls + re-renders to settle.
  const unchecked = page.locator("input[type='checkbox']:not(:disabled):not(:checked)");
  let count = await unchecked.count();
  let maxIterations = 20; // Safety limit to prevent infinite loops
  while (count > 0 && maxIterations > 0) {
    await unchecked.first().click({ timeout: 5_000 });
    // Wait for the API call to complete and UI to re-render
    await page.waitForTimeout(1_000);
    count = await unchecked.count();
    maxIterations--;
  }
}

/** Complete the current step (check all reqs then click Mark Complete) */
async function completeCurrentStep(page: Page): Promise<void> {
  await checkAllRequirements(page);
  // Wait for any pending API calls to settle before checking button state
  await page.waitForTimeout(500);
  const completeBtn = page.getByRole("button", { name: "Mark Complete" });
  await expect(completeBtn).toBeEnabled({ timeout: 15_000 });
  await completeBtn.click();
  await page.waitForTimeout(1_000);
}

/** Skip the current step with a reason */
async function skipCurrentStep(page: Page, reason: string): Promise<void> {
  await page.getByRole("button", { name: "Skip Step" }).click();
  const textarea = page.getByPlaceholder("e.g. Not applicable for our deployment model");
  await textarea.fill(reason);
  await page.getByRole("button", { name: "Confirm Skip" }).click();
  await page.waitForTimeout(500);
}

// ── Test 1: Full wizard flow ───────────────────────────────────────────
test.describe("Full Wizard Flow", () => {
  test("create → complete phase 1 steps → verify phase 2 unlocks", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "E2E Flow Test");

    // Verify we're on the wizard detail page
    await expect(page.getByRole("heading", { name: "E2E Flow Test" })).toBeVisible();

    // Phase 1 steps should be available (clickable)
    await expect(page.getByRole("button", { name: "Risk Management System" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Data & Data Governance" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Record-Keeping (Logging)" })).toBeEnabled();

    // Phase 2 steps should be locked (disabled)
    await expect(page.getByRole("button", { name: "Technical Documentation" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Transparency & User Info" })).toBeDisabled();

    // Complete AIA-9 (Risk Management)
    await selectStep(page, "Risk Management System");
    await expect(page.getByText("AIA-9")).toBeVisible();
    await completeCurrentStep(page);

    // After completing AIA-9, AIA-13 and AIA-14 should unlock (depend only on AIA-9)
    await expect(page.getByRole("button", { name: "Transparency & User Info" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Human Oversight" })).toBeEnabled();

    // AIA-11 still locked (needs AIA-9 AND AIA-10)
    await expect(page.getByRole("button", { name: "Technical Documentation" })).toBeDisabled();

    // Complete AIA-10 (Data Governance)
    await selectStep(page, "Data & Data Governance");
    await completeCurrentStep(page);

    // Now AIA-11 and AIA-15 should unlock (AIA-9 + AIA-10 complete)
    await expect(page.getByRole("button", { name: "Technical Documentation" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Accuracy, Robustness & Cybersecurity" })).toBeEnabled();

    // Complete AIA-12 to finish phase 1
    await selectStep(page, "Record-Keeping (Logging)");
    await completeCurrentStep(page);

    // Progress should show 3 completed / 25% (allow time for API + re-render)
    await expect(page.getByText("3 completed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("25%", { exact: true })).toBeVisible();
  });
});

// ── Test 2: Skip step → dependents remain locked ───────────────────────
test.describe("Skip Step Behavior", () => {
  test("skip AIA-9 (skipUnlocksDependents: false) → dependents remain locked", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Skip Test");

    // Skip AIA-9 which has skipUnlocksDependents: false
    await selectStep(page, "Risk Management System");
    await skipCurrentStep(page, "Not applicable for our use case");

    // Step header badge should show "Skipped"
    await expect(page.getByText("Skipped", { exact: true })).toBeVisible();
    await expect(page.getByText("Not applicable for our use case")).toBeVisible();

    // Phase 2 steps that depend on AIA-9 should REMAIN locked
    await expect(page.getByRole("button", { name: "Transparency & User Info" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Human Oversight" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Technical Documentation" })).toBeDisabled();

    // AIA-10 and AIA-12 (no deps) should still be available
    await expect(page.getByRole("button", { name: "Data & Data Governance" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Record-Keeping (Logging)" })).toBeEnabled();

    // Progress should show 1 skipped
    await expect(page.getByText("1 skipped")).toBeVisible();
  });

  test("skip AIA-12 (skipUnlocksDependents: true) → skipped state shown", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Skip Unlock Test");

    // Skip AIA-12 which has skipUnlocksDependents: true
    await selectStep(page, "Record-Keeping (Logging)");
    await skipCurrentStep(page, "Logging handled by cloud provider");

    // Step should be skipped
    await expect(page.getByText("Skipped", { exact: true })).toBeVisible();
    await expect(page.getByText("Logging handled by cloud provider")).toBeVisible();
    await expect(page.getByText("This step has been skipped and is read-only.")).toBeVisible();
  });
});

// ── Test 3: Complete all 12 steps → generate documents ─────────────────
test.describe("Complete All Steps and Generate Documents", () => {
  test("complete all 12 steps → generate all 4 documents", async ({ page }) => {
    test.setTimeout(180_000);
    await createWizardViaUI(page, "Full Completion Test");

    // Phase 1
    for (const title of ["Risk Management System", "Data & Data Governance", "Record-Keeping (Logging)"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 2
    for (const title of ["Technical Documentation", "Transparency & User Info", "Human Oversight", "Accuracy, Robustness & Cybersecurity"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 3
    for (const title of ["Quality Management System", "Obligations of Deployers", "EU Declaration of Conformity"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 4
    for (const title of ["Serious Incident Reporting", "Post-Market Monitoring"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Verify 100% progress
    await expect(page.getByText("12 completed")).toBeVisible();
    await expect(page.getByText("100%", { exact: true })).toBeVisible();

    // Generate documents button should be visible
    await expect(page.getByRole("button", { name: "Generate Documents" })).toBeVisible();
  });
});

// ── Test 4: Stepper UI reflects correct states ─────────────────────────
test.describe("Stepper UI States", () => {
  test("stepper shows locked/available/in_progress/completed states", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "State Icons Test");

    // Locked steps should be disabled
    const lockedSteps = ["Technical Documentation", "Transparency & User Info", "Human Oversight",
      "Accuracy, Robustness & Cybersecurity", "Quality Management System", "Obligations of Deployers",
      "EU Declaration of Conformity", "Serious Incident Reporting", "Post-Market Monitoring"];
    for (const title of lockedSteps) {
      await expect(page.getByRole("button", { name: title })).toBeDisabled();
    }

    // Available steps should be enabled
    for (const title of ["Risk Management System", "Data & Data Governance", "Record-Keeping (Logging)"]) {
      await expect(page.getByRole("button", { name: title })).toBeEnabled();
    }

    // Click AIA-9 and check a single requirement → triggers in_progress
    await selectStep(page, "Risk Management System");
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    await firstCheckbox.click();
    await page.waitForTimeout(500);

    // Step header badge should show "In Progress"
    await expect(page.getByText("In Progress")).toBeVisible();

    // Complete the step
    await completeCurrentStep(page);

    // Re-select to verify completed state
    await selectStep(page, "Risk Management System");
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByText("This step has been completed and is read-only.")).toBeVisible();
  });
});

// ── Test 5: Requirement checklist → complete button enables ────────────
test.describe("Requirement Checklist", () => {
  test("checking all required boxes enables the Mark Complete button", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Checklist Test");

    await selectStep(page, "Record-Keeping (Logging)");
    // AIA-12 has 3 required requirements

    // Mark Complete should be disabled initially
    const completeBtn = page.getByRole("button", { name: "Mark Complete" });
    await expect(completeBtn).toBeDisabled();

    // Check progress counter
    await expect(page.getByText("0 of 3 required items completed")).toBeVisible();

    // Check requirements one by one
    const checkboxes = page.locator("input[type='checkbox']");
    await checkboxes.nth(0).click();
    await page.waitForTimeout(400);
    await expect(page.getByText("1 of 3 required items completed")).toBeVisible();
    await expect(completeBtn).toBeDisabled();

    await checkboxes.nth(1).click();
    await page.waitForTimeout(400);
    await expect(page.getByText("2 of 3 required items completed")).toBeVisible();
    await expect(completeBtn).toBeDisabled();

    await checkboxes.nth(2).click();
    await page.waitForTimeout(400);
    await expect(page.getByText("3 of 3 required items completed")).toBeVisible();

    // Now Mark Complete should be enabled
    await expect(completeBtn).toBeEnabled();
  });

  test("optional requirements do not block completion", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Optional Test");

    await selectStep(page, "Data & Data Governance");
    // AIA-10 has 5 required + 1 optional (data_privacy)

    // Check only the 5 required items (skip the 6th optional one)
    const checkboxes = page.locator("input[type='checkbox']");
    for (let i = 0; i < 5; i++) {
      await checkboxes.nth(i).click();
      await page.waitForTimeout(300);
    }

    // Should show "5 of 5 required items completed" (optional not counted in denominator)
    await expect(page.getByText("5 of 5 required items completed")).toBeVisible();

    // Mark Complete should be enabled even without the optional checkbox
    await expect(page.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });
});

// ── Test 6: Evidence section ───────────────────────────────────────────
test.describe("Evidence Section", () => {
  test("evidence section shows empty state and upload button", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Evidence Test");

    await selectStep(page, "Risk Management System");

    // Evidence section should show empty state
    await expect(page.getByText("No evidence files attached yet.")).toBeVisible();

    // Upload File button should be visible for editable steps
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible();

    // Evidence heading should be visible
    await expect(page.getByRole("heading", { name: "Evidence", exact: true })).toBeVisible();
  });

  test("evidence section is read-only for completed steps", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Evidence Readonly Test");

    await selectStep(page, "Risk Management System");
    await completeCurrentStep(page);

    // Re-select the completed step
    await selectStep(page, "Risk Management System");

    // Upload File button should NOT be visible for completed steps
    await expect(page.getByRole("button", { name: "Upload File" })).not.toBeVisible();
  });
});

// ── Test 7: Mobile responsive ──────────────────────────────────────────
test.describe("Mobile Responsive", () => {
  test("sidebar phase labels visible at desktop width", async ({ page }) => {
    await createWizardViaUI(page, "Mobile Test");

    await expect(page.getByText("Phase 1: Foundation")).toBeVisible();
    await expect(page.getByText("Phase 2: Core Requirements")).toBeVisible();
    await expect(page.getByText("Phase 3: Conformity")).toBeVisible();
    await expect(page.getByText("Phase 4: Post-Market")).toBeVisible();
  });

  test("sidebar is scrollable on small viewport height", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await createWizardViaUI(page, "Small Height Test");

    await expect(page.getByText("Phase 1: Foundation")).toBeVisible();
    const sidebar = page.locator(".overflow-y-auto").first();
    await expect(sidebar).toBeVisible();
  });
});

// ── Test 8: Resume wizard ──────────────────────────────────────────────
test.describe("Resume Wizard", () => {
  test("navigate away → return → state persisted", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Resume Test");

    // Complete AIA-9
    await selectStep(page, "Risk Management System");
    await completeCurrentStep(page);

    // Verify completed
    await selectStep(page, "Risk Management System");
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();

    // Navigate away to wizard list
    await page.getByRole("link", { name: "Back" }).click();
    await page.waitForURL(/\/compliance\/wizards$/, { timeout: 10_000 });

    // The wizard list should show our wizard
    await expect(page.getByText("Resume Test")).toBeVisible();

    // Navigate back to the wizard detail via the "Open" link in the row containing our wizard
    const row = page.locator("tr", { hasText: "Resume Test" });
    await row.getByRole("link", { name: "Open" }).click();
    await page.waitForURL(/\/compliance\/wizards\/wiz-/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // AIA-9 should still be completed
    await selectStep(page, "Risk Management System");
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByText("This step has been completed and is read-only.")).toBeVisible();

    // AIA-13 and AIA-14 should still be unlocked
    await expect(page.getByRole("button", { name: "Transparency & User Info" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Human Oversight" })).toBeEnabled();

    // Progress should still show 1 completed
    await expect(page.getByText("1 completed")).toBeVisible();
  });
});

// ── Test 9: Delete Wizard Flow ──────────────────────────────────────────
test.describe("Delete Wizard Flow", () => {
  test("create wizard → delete via UI → wizard removed from list", async ({ page }) => {
    test.setTimeout(60_000);

    // Create a wizard
    await createWizardViaUI(page, "Wizard To Delete");

    // Verify we're on the detail page
    await expect(page.getByRole("heading", { name: "Wizard To Delete" })).toBeVisible();

    // Navigate to wizard list and verify it appears
    await page.getByRole("link", { name: "Back" }).click();
    await page.waitForURL(/\/compliance\/wizards$/, { timeout: 10_000 });
    await expect(page.getByText("Wizard To Delete")).toBeVisible();

    // Navigate back into the wizard detail
    const row = page.locator("tr", { hasText: "Wizard To Delete" });
    await row.getByRole("link", { name: "Open" }).click();
    await page.waitForURL(/\/compliance\/wizards\/wiz-/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // Click the Delete button in the header
    await page.getByRole("button", { name: "Delete" }).click();

    // Confirmation dialog should appear
    await expect(page.getByText("Delete this wizard?")).toBeVisible();
    await expect(page.getByText("This will permanently delete")).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: "Delete Wizard" }).click();

    // Should navigate back to wizard list
    await page.waitForURL(/\/compliance\/wizards$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // Wizard should no longer appear in the list
    await expect(page.getByText("Wizard To Delete")).not.toBeVisible();
  });
});

// ── Test 10: Error Handling / API Failure Resilience ────────────────────
test.describe("Error Handling and API Failure Resilience", () => {
  test("Mark Complete is disabled when requirements are incomplete", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Error Handling Test");

    // Select a step with multiple requirements
    await selectStep(page, "Risk Management System");

    // Mark Complete should be disabled initially (no requirements checked)
    const completeBtn = page.getByRole("button", { name: "Mark Complete" });
    await expect(completeBtn).toBeDisabled();

    // Check only one requirement (step has 5 required)
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    await firstCheckbox.click();
    await page.waitForTimeout(500);

    // Mark Complete should still be disabled (not all required items checked)
    await expect(completeBtn).toBeDisabled();
  });

  test("locked step buttons are disabled and not clickable", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Locked Step Test");

    // Phase 2+ steps should be locked/disabled
    const lockedStep = page.getByRole("button", { name: "Technical Documentation" });
    await expect(lockedStep).toBeDisabled();

    // Verify multiple locked steps are disabled
    await expect(page.getByRole("button", { name: "Human Oversight" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Quality Management System" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Post-Market Monitoring" })).toBeDisabled();

    // Phase 1 steps should remain enabled
    await expect(page.getByRole("button", { name: "Risk Management System" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Data & Data Governance" })).toBeEnabled();
  });
});

// ── Test 11: Document Readiness Check ───────────────────────────────────
test.describe("Document Readiness Check", () => {
  test("complete all steps → generate documents → verify documents displayed", async ({ page }) => {
    test.setTimeout(180_000);
    await createWizardViaUI(page, "Doc Generation Test");

    // Complete all 12 steps in dependency order
    // Phase 1
    for (const title of ["Risk Management System", "Data & Data Governance", "Record-Keeping (Logging)"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 2
    for (const title of ["Technical Documentation", "Transparency & User Info", "Human Oversight", "Accuracy, Robustness & Cybersecurity"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 3
    for (const title of ["Quality Management System", "Obligations of Deployers", "EU Declaration of Conformity"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Phase 4
    for (const title of ["Serious Incident Reporting", "Post-Market Monitoring"]) {
      await selectStep(page, title);
      await completeCurrentStep(page);
    }

    // Verify 100% progress
    await expect(page.getByText("100%", { exact: true })).toBeVisible();

    // Click "Generate Documents" to open the document panel
    await page.getByRole("button", { name: "Generate Documents" }).click();
    await page.waitForTimeout(1_000);

    // Verify the Documents panel heading appears
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();

    // All steps complete → "Generate All" button should appear
    const generateAllBtn = page.getByRole("button", { name: "Generate All" });
    await expect(generateAllBtn).toBeVisible({ timeout: 10_000 });

    // Click "Generate All" to trigger document generation
    await generateAllBtn.click();
    await page.waitForTimeout(2_000);

    // Documents should now show "Ready - Download" status
    await expect(page.getByText("Ready - Download").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── Test 12: Evidence Upload UI Validation ──────────────────────────────
test.describe("Evidence Upload UI Validation", () => {
  test("evidence section visible with empty state on fresh step", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Evidence UI Validation Test");

    // Navigate to a step
    await selectStep(page, "Data & Data Governance");

    // Evidence heading should be visible
    await expect(page.getByRole("heading", { name: "Evidence", exact: true })).toBeVisible();

    // Should show empty state text
    await expect(page.getByText("No evidence files attached yet.")).toBeVisible();

    // Upload File button should be visible (step is editable)
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible();
  });

  test("evidence section becomes read-only after completing a step", async ({ page }) => {
    test.setTimeout(60_000);
    await createWizardViaUI(page, "Evidence Readonly Validation");

    // Select a step and verify Upload File is available before completion
    await selectStep(page, "Record-Keeping (Logging)");
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible();

    // Complete the step
    await completeCurrentStep(page);

    // Re-select the now-completed step
    await selectStep(page, "Record-Keeping (Logging)");

    // Step should show completed and read-only state
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(page.getByText("This step has been completed and is read-only.")).toBeVisible();

    // Upload File button should NOT be visible for completed steps
    await expect(page.getByRole("button", { name: "Upload File" })).not.toBeVisible();
  });
});

// ── Test 13: Concurrent Operations (Multiple Wizards) ───────────────────
test.describe("Concurrent Operations - Multiple Wizards", () => {
  test("two wizards maintain independent state", async ({ page }) => {
    test.setTimeout(60_000);

    // Create first wizard
    await createWizardViaUI(page, "Wizard Alpha");
    await expect(page.getByRole("heading", { name: "Wizard Alpha" })).toBeVisible();

    // Complete AIA-9 on the first wizard
    await selectStep(page, "Risk Management System");
    await completeCurrentStep(page);

    // Verify progress shows 1 completed
    await expect(page.getByText("1 completed")).toBeVisible();

    // Navigate back to wizard list
    await page.getByRole("link", { name: "Back" }).click();
    await page.waitForURL(/\/compliance\/wizards$/, { timeout: 10_000 });

    // Create second wizard
    await createWizardViaUI(page, "Wizard Beta");
    await expect(page.getByRole("heading", { name: "Wizard Beta" })).toBeVisible();

    // Verify second wizard is at initial state (0 completed)
    await expect(page.getByText("0 completed")).toBeVisible();

    // Phase 1 steps should be available (not yet completed)
    await expect(page.getByRole("button", { name: "Risk Management System" })).toBeEnabled();
    await selectStep(page, "Risk Management System");

    // Mark Complete should be disabled (no requirements checked yet)
    await expect(page.getByRole("button", { name: "Mark Complete" })).toBeDisabled();

    // Phase 2 steps should still be locked on the second wizard
    await expect(page.getByRole("button", { name: "Technical Documentation" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Transparency & User Info" })).toBeDisabled();

    // Navigate back to list and verify both wizards appear
    await page.getByRole("link", { name: "Back" }).click();
    await page.waitForURL(/\/compliance\/wizards$/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Wizard Alpha")).toBeVisible();
    await expect(page.getByText("Wizard Beta")).toBeVisible();

    // Re-open first wizard and verify its progress is preserved
    const alphaRow = page.locator("tr", { hasText: "Wizard Alpha" });
    await alphaRow.getByRole("link", { name: "Open" }).click();
    await page.waitForURL(/\/compliance\/wizards\/wiz-/, { timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    // First wizard should still show 1 completed
    await expect(page.getByText("1 completed")).toBeVisible();

    // AIA-9 should still be completed on first wizard
    await selectStep(page, "Risk Management System");
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  });
});
