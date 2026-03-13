import { describe, test, expect, vi, beforeEach } from "vitest";
import { OrgScheduleManager } from "../org-schedule-manager.js";

function createMockDb() {
  return {
    organization: {
      findMany: vi.fn(async () => [
        { id: "org-1", settings: { scanSchedule: "0 6 * * *" } },
        { id: "org-2", settings: {} },
      ]),
    },
  };
}

describe("OrgScheduleManager", () => {
  let db: ReturnType<typeof createMockDb>;
  let manager: OrgScheduleManager;

  beforeEach(() => {
    db = createMockDb();
    manager = new OrgScheduleManager(db as any, "0 2 * * *");
  });

  test("loadOverrides fetches org settings from DB", async () => {
    await manager.loadOverrides();
    expect(db.organization.findMany).toHaveBeenCalled();
  });

  test("getSchedule returns override for org with custom schedule", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-1")).toBe("0 6 * * *");
  });

  test("getSchedule returns default for org without override", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-2")).toBe("0 2 * * *");
  });

  test("getSchedule returns default for unknown org", async () => {
    await manager.loadOverrides();
    expect(manager.getSchedule("org-unknown")).toBe("0 2 * * *");
  });

  test("getActiveOverrides returns only orgs with custom schedules", async () => {
    await manager.loadOverrides();
    const overrides = manager.getActiveOverrides();
    expect(overrides).toEqual({ "org-1": "0 6 * * *" });
  });

  test("loadOverrides handles DB failure gracefully", async () => {
    db.organization.findMany.mockRejectedValueOnce(new Error("DB down"));
    await manager.loadOverrides(); // should not throw
    expect(manager.getSchedule("org-1")).toBe("0 2 * * *"); // falls back to default
  });
});
