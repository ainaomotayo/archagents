import { describe, it, expect, vi } from "vitest";
import { createStatusBar, updateStatusBar } from "../../src/features/status-bar.js";

describe("StatusBar", () => {
  it("creates with default connected text", () => {
    const item = createStatusBar();
    expect(item.text).toBe("$(shield) Sentinel");
  });

  it("updates to connected state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "connected", 3, 7);
    expect(item.text).toBe("$(shield) Sentinel: 3 critical, 7 high");
    expect(item.backgroundColor).toBeUndefined();
  });

  it("updates to offline state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "offline", 0, 0);
    expect(item.text).toContain("offline");
    expect(item.backgroundColor).toBeDefined();
  });

  it("updates to auth_error state", () => {
    const item = createStatusBar();
    updateStatusBar(item, "auth_error", 0, 0);
    expect(item.text).toContain("auth error");
    expect(item.backgroundColor).toBeDefined();
  });

  it("click opens command palette", () => {
    const item = createStatusBar();
    expect(item.command).toBe("workbench.action.showCommands");
  });

  it("connected tooltip includes finding count and sync time", () => {
    const item = createStatusBar();
    updateStatusBar(item, "connected", 2, 5);
    expect(item.tooltip).toContain("2 critical");
    expect(item.tooltip).toContain("5 high");
    expect(item.tooltip).toContain("Last sync");
  });
});
