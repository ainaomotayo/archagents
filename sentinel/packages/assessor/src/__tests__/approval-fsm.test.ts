import { describe, it, expect } from "vitest";
import { ApprovalFSM, type GateState } from "../approval-fsm.js";

describe("ApprovalFSM", () => {
  it("allows pending -> approved", () => {
    expect(ApprovalFSM.transition("pending", "approve")).toBe("approved");
  });

  it("allows pending -> rejected", () => {
    expect(ApprovalFSM.transition("pending", "reject")).toBe("rejected");
  });

  it("allows pending -> escalated", () => {
    expect(ApprovalFSM.transition("pending", "escalate")).toBe("escalated");
  });

  it("allows pending -> expired", () => {
    expect(ApprovalFSM.transition("pending", "expire")).toBe("expired");
  });

  it("allows escalated -> approved", () => {
    expect(ApprovalFSM.transition("escalated", "approve")).toBe("approved");
  });

  it("allows escalated -> rejected", () => {
    expect(ApprovalFSM.transition("escalated", "reject")).toBe("rejected");
  });

  it("allows escalated -> expired", () => {
    expect(ApprovalFSM.transition("escalated", "expire")).toBe("expired");
  });

  it("throws on invalid transition: approved -> rejected", () => {
    expect(() => ApprovalFSM.transition("approved", "reject")).toThrow(
      "Invalid transition",
    );
  });

  it("throws on invalid transition: rejected -> approved", () => {
    expect(() => ApprovalFSM.transition("rejected", "approve")).toThrow(
      "Invalid transition",
    );
  });

  it("throws on invalid transition: expired -> approved", () => {
    expect(() => ApprovalFSM.transition("expired", "approve")).toThrow(
      "Invalid transition",
    );
  });

  it("isTerminal returns true for approved/rejected/expired", () => {
    expect(ApprovalFSM.isTerminal("approved")).toBe(true);
    expect(ApprovalFSM.isTerminal("rejected")).toBe(true);
    expect(ApprovalFSM.isTerminal("expired")).toBe(true);
  });

  it("isTerminal returns false for pending/escalated", () => {
    expect(ApprovalFSM.isTerminal("pending")).toBe(false);
    expect(ApprovalFSM.isTerminal("escalated")).toBe(false);
  });

  it("canDecide returns true for pending and escalated", () => {
    expect(ApprovalFSM.canDecide("pending")).toBe(true);
    expect(ApprovalFSM.canDecide("escalated")).toBe(true);
  });

  it("canDecide returns false for terminal states", () => {
    expect(ApprovalFSM.canDecide("approved")).toBe(false);
    expect(ApprovalFSM.canDecide("rejected")).toBe(false);
    expect(ApprovalFSM.canDecide("expired")).toBe(false);
  });
});
