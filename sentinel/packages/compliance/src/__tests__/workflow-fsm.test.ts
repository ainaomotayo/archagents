import { describe, it, expect } from "vitest";
import { WorkflowFSM, WORKFLOW_STAGES, TERMINAL_STAGES } from "../remediation/workflow-fsm.js";

describe("WorkflowFSM", () => {
  const fsm = new WorkflowFSM([]);

  it("advances open -> assigned", () => {
    expect(fsm.nextStage("open")).toBe("assigned");
  });

  it("advances through full pipeline", () => {
    let stage = "open";
    const visited = [stage];
    while (!TERMINAL_STAGES.has(stage)) {
      stage = fsm.nextStage(stage)!;
      visited.push(stage);
    }
    expect(visited).toEqual(["open", "assigned", "in_progress", "in_review", "awaiting_deployment", "completed"]);
  });

  it("allows transition to accepted_risk from any non-terminal", () => {
    expect(fsm.canTransition("open", "accepted_risk")).toBe(true);
    expect(fsm.canTransition("in_progress", "accepted_risk")).toBe(true);
    expect(fsm.canTransition("completed", "accepted_risk")).toBe(false);
  });

  it("allows transition to blocked from any non-terminal", () => {
    expect(fsm.canTransition("in_progress", "blocked")).toBe(true);
    expect(fsm.canTransition("completed", "blocked")).toBe(false);
  });

  it("skips stages when configured", () => {
    const skipFsm = new WorkflowFSM(["assigned", "in_review", "awaiting_deployment"]);
    expect(skipFsm.nextStage("open")).toBe("in_progress");
    expect(skipFsm.nextStage("in_progress")).toBe("completed");
  });

  it("allows backward transition (reopen)", () => {
    expect(fsm.canTransition("in_progress", "open")).toBe(true);
    expect(fsm.canTransition("assigned", "open")).toBe(true);
  });

  it("rejects invalid transitions from terminal states", () => {
    expect(fsm.canTransition("completed", "open")).toBe(false);
    expect(fsm.canTransition("accepted_risk", "open")).toBe(false);
  });

  it("returns all active stages (excluding skipped)", () => {
    const skipFsm = new WorkflowFSM(["in_review"]);
    const active = skipFsm.getActiveStages();
    expect(active).not.toContain("in_review");
    expect(active).toContain("open");
    expect(active).toContain("completed");
  });

  it("validates skip stages against allowed list", () => {
    expect(() => new WorkflowFSM(["invalid_stage"])).toThrow("Invalid skip stage");
  });

  it("prevents skipping required stages (open, completed)", () => {
    expect(() => new WorkflowFSM(["open"])).toThrow("Cannot skip required stage");
    expect(() => new WorkflowFSM(["completed"])).toThrow("Cannot skip required stage");
  });
});
