import { describe, it, expect } from "vitest";
import { canTransition, validateTransition, canComplete, canSkip } from "../wizard/fsm.js";
import type { StepRequirement } from "../wizard/types.js";

describe("FSM engine", () => {
  describe("canTransition", () => {
    it("allows valid transitions", () => {
      expect(canTransition("locked", "available")).toBe(true);
      expect(canTransition("available", "in_progress")).toBe(true);
      expect(canTransition("available", "skipped")).toBe(true);
      expect(canTransition("in_progress", "completed")).toBe(true);
      expect(canTransition("in_progress", "skipped")).toBe(true);
      expect(canTransition("in_progress", "available")).toBe(true);
      expect(canTransition("completed", "in_progress")).toBe(true);
      expect(canTransition("skipped", "available")).toBe(true);
    });

    it("rejects invalid transitions", () => {
      expect(canTransition("locked", "completed")).toBe(false);
      expect(canTransition("locked", "in_progress")).toBe(false);
      expect(canTransition("completed", "skipped")).toBe(false);
      expect(canTransition("skipped", "completed")).toBe(false);
      expect(canTransition("completed", "locked")).toBe(false);
    });
  });

  describe("canComplete", () => {
    it("fails when non-optional requirement is unchecked", () => {
      const reqs: StepRequirement[] = [
        { key: "a", label: "A", completed: true, optional: false },
        { key: "b", label: "B", completed: false, optional: false },
      ];
      const result = canComplete(reqs);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("b");
    });

    it("succeeds when all non-optional are checked (optional unchecked OK)", () => {
      const reqs: StepRequirement[] = [
        { key: "a", label: "A", completed: true, optional: false },
        { key: "b", label: "B", completed: false, optional: true },
      ];
      expect(canComplete(reqs).valid).toBe(true);
    });

    it("succeeds when all requirements are checked", () => {
      const reqs: StepRequirement[] = [
        { key: "a", label: "A", completed: true, optional: false },
        { key: "b", label: "B", completed: true, optional: false },
      ];
      expect(canComplete(reqs).valid).toBe(true);
    });
  });

  describe("canSkip", () => {
    it("fails without reason", () => {
      expect(canSkip().valid).toBe(false);
      expect(canSkip("").valid).toBe(false);
      expect(canSkip("  ").valid).toBe(false);
    });

    it("succeeds with reason", () => {
      expect(canSkip("Not applicable").valid).toBe(true);
    });
  });

  describe("validateTransition", () => {
    it("validates complete transition checks requirements", () => {
      const reqs: StepRequirement[] = [
        { key: "a", label: "A", completed: false, optional: false },
      ];
      const result = validateTransition("in_progress", "completed", { requirements: reqs });
      expect(result.valid).toBe(false);
    });

    it("validates skip transition checks reason", () => {
      const result = validateTransition("available", "skipped", {});
      expect(result.valid).toBe(false);
      expect(result.error).toContain("reason");
    });
  });
});
