import { describe, it, expect } from "vitest";
import { topologicalSort, computeAvailableSteps, canUnlock, validateDAG } from "../wizard/dag.js";
import { EU_AI_ACT_CONTROLS, EU_AI_ACT_CONTROL_MAP } from "../wizard/eu-ai-act-controls.js";
import type { StepState, WizardControlMeta } from "../wizard/types.js";

describe("DAG engine", () => {
  describe("topologicalSort", () => {
    it("returns phases with correct topological ordering", () => {
      const phases = topologicalSort(EU_AI_ACT_CONTROLS);
      // Pure topological sort: AIA-61 depends on AIA-60 so they're separate levels
      expect(phases.length).toBeGreaterThanOrEqual(4);

      // Flatten with phase index to verify ordering
      const phaseOf = new Map<string, number>();
      phases.forEach((p, i) => p.forEach((c) => phaseOf.set(c.code, i)));

      // Phase 1 controls have no deps — must be in first phase
      expect(phaseOf.get("AIA-9")).toBe(0);
      expect(phaseOf.get("AIA-10")).toBe(0);
      expect(phaseOf.get("AIA-12")).toBe(0);

      // Every control appears after all its dependencies
      for (const control of EU_AI_ACT_CONTROLS) {
        for (const dep of control.dependencies) {
          expect(phaseOf.get(control.code)!).toBeGreaterThan(phaseOf.get(dep)!);
        }
      }
    });

    it("returns empty for empty controls", () => {
      expect(topologicalSort([])).toEqual([]);
    });

    it("throws on cycle", () => {
      const cyclic: WizardControlMeta[] = [
        { code: "A", article: "", title: "", phase: 1, dependencies: ["B"], requirements: [], documentContributions: [], skipUnlocksDependents: false },
        { code: "B", article: "", title: "", phase: 1, dependencies: ["A"], requirements: [], documentContributions: [], skipUnlocksDependents: false },
      ];
      expect(() => topologicalSort(cyclic)).toThrow(/Cycle detected/);
    });
  });

  describe("computeAvailableSteps", () => {
    it("returns phase 1 codes when all are locked", () => {
      const states = new Map<string, StepState>(
        EU_AI_ACT_CONTROLS.map((c) => [c.code, "locked"]),
      );
      const available = computeAvailableSteps(EU_AI_ACT_CONTROLS, states);
      expect(available.sort()).toEqual(["AIA-10", "AIA-12", "AIA-9"]);
    });

    it("completing AIA-9 and AIA-10 makes AIA-11 and AIA-15 available", () => {
      const states = new Map<string, StepState>(
        EU_AI_ACT_CONTROLS.map((c) => [c.code, "locked"]),
      );
      states.set("AIA-9", "completed");
      states.set("AIA-10", "completed");
      states.set("AIA-12", "available");

      const available = computeAvailableSteps(EU_AI_ACT_CONTROLS, states);
      expect(available).toContain("AIA-11");
      expect(available).toContain("AIA-15");
      expect(available).toContain("AIA-13");
      expect(available).toContain("AIA-14");
    });

    it("completing only AIA-9 makes AIA-13 and AIA-14 available but NOT AIA-11", () => {
      const states = new Map<string, StepState>(
        EU_AI_ACT_CONTROLS.map((c) => [c.code, "locked"]),
      );
      states.set("AIA-9", "completed");
      states.set("AIA-10", "available");
      states.set("AIA-12", "available");

      const available = computeAvailableSteps(EU_AI_ACT_CONTROLS, states);
      expect(available).toContain("AIA-13");
      expect(available).toContain("AIA-14");
      expect(available).not.toContain("AIA-11");
      expect(available).not.toContain("AIA-15");
    });

    it("skipping AIA-9 (skipUnlocksDependents=false) does NOT unlock AIA-13", () => {
      const states = new Map<string, StepState>(
        EU_AI_ACT_CONTROLS.map((c) => [c.code, "locked"]),
      );
      states.set("AIA-9", "skipped");
      states.set("AIA-10", "available");
      states.set("AIA-12", "available");

      const available = computeAvailableSteps(EU_AI_ACT_CONTROLS, states);
      expect(available).not.toContain("AIA-13");
      expect(available).not.toContain("AIA-14");
    });
  });

  describe("validateDAG", () => {
    it("validates EU AI Act controls as valid", () => {
      expect(validateDAG(EU_AI_ACT_CONTROLS)).toEqual({ valid: true });
    });

    it("detects cycles", () => {
      const cyclic: WizardControlMeta[] = [
        { code: "A", article: "", title: "", phase: 1, dependencies: ["B"], requirements: [], documentContributions: [], skipUnlocksDependents: false },
        { code: "B", article: "", title: "", phase: 1, dependencies: ["A"], requirements: [], documentContributions: [], skipUnlocksDependents: false },
      ];
      const result = validateDAG(cyclic);
      expect(result.valid).toBe(false);
      expect(result.cycle).toContain("A");
      expect(result.cycle).toContain("B");
    });

    it("returns valid for empty controls", () => {
      expect(validateDAG([])).toEqual({ valid: true });
    });
  });
});
