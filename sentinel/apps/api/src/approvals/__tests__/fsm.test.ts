import { describe, it, expect } from "vitest";
import {
  canTransition,
  validateTransition,
  TERMINAL_STATUSES,
} from "../fsm.js";

describe("canTransition", () => {
  it("allows pending → approved", () => {
    expect(canTransition("pending", "approved")).toBe(true);
  });

  it("allows pending → rejected", () => {
    expect(canTransition("pending", "rejected")).toBe(true);
  });

  it("allows pending → escalated", () => {
    expect(canTransition("pending", "escalated")).toBe(true);
  });

  it("allows pending → expired", () => {
    expect(canTransition("pending", "expired")).toBe(true);
  });

  it("allows escalated → approved", () => {
    expect(canTransition("escalated", "approved")).toBe(true);
  });

  it("allows escalated → rejected", () => {
    expect(canTransition("escalated", "rejected")).toBe(true);
  });

  it("allows escalated → expired", () => {
    expect(canTransition("escalated", "expired")).toBe(true);
  });

  it("rejects approved → anything", () => {
    expect(canTransition("approved", "pending")).toBe(false);
    expect(canTransition("approved", "rejected")).toBe(false);
    expect(canTransition("approved", "escalated")).toBe(false);
  });

  it("rejects rejected → anything", () => {
    expect(canTransition("rejected", "approved")).toBe(false);
    expect(canTransition("rejected", "pending")).toBe(false);
  });

  it("rejects expired → anything", () => {
    expect(canTransition("expired", "approved")).toBe(false);
    expect(canTransition("expired", "pending")).toBe(false);
  });

  it("rejects same-state transition", () => {
    expect(canTransition("pending", "pending")).toBe(false);
  });
});

describe("validateTransition", () => {
  it("returns ok for valid transition", () => {
    const result = validateTransition("pending", "approved");
    expect(result.ok).toBe(true);
  });

  it("returns error for invalid transition", () => {
    const result = validateTransition("approved", "rejected");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("approved");
    }
  });
});

describe("TERMINAL_STATUSES", () => {
  it("includes approved, rejected, expired", () => {
    expect(TERMINAL_STATUSES).toContain("approved");
    expect(TERMINAL_STATUSES).toContain("rejected");
    expect(TERMINAL_STATUSES).toContain("expired");
  });

  it("does not include pending or escalated", () => {
    expect(TERMINAL_STATUSES).not.toContain("pending");
    expect(TERMINAL_STATUSES).not.toContain("escalated");
  });
});
