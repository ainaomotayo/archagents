import { describe, it, expect } from "vitest";
import {
  statusColor,
  statusLabel,
  defaultTTLDays,
  canTransition,
  canUserAct,
} from "../attestation-types";

describe("statusColor", () => {
  it("returns correct classes for all statuses", () => {
    expect(statusColor("draft")).toContain("bg-surface-3");
    expect(statusColor("pending_review")).toContain("text-amber-500");
    expect(statusColor("pending_approval")).toContain("text-blue-500");
    expect(statusColor("approved")).toContain("text-status-pass");
    expect(statusColor("rejected")).toContain("text-status-fail");
    expect(statusColor("expired")).toContain("bg-surface-3");
    expect(statusColor("superseded")).toContain("bg-surface-3");
  });
});

describe("statusLabel", () => {
  it("returns human-readable labels", () => {
    expect(statusLabel("draft")).toBe("Draft");
    expect(statusLabel("pending_review")).toBe("Pending Review");
    expect(statusLabel("pending_approval")).toBe("Pending Approval");
    expect(statusLabel("approved")).toBe("Approved");
    expect(statusLabel("rejected")).toBe("Rejected");
    expect(statusLabel("expired")).toBe("Expired");
    expect(statusLabel("superseded")).toBe("Superseded");
  });
});

describe("defaultTTLDays", () => {
  it("returns correct values per framework", () => {
    expect(defaultTTLDays("soc2")).toBe(90);
    expect(defaultTTLDays("iso27001")).toBe(180);
    expect(defaultTTLDays("slsa")).toBe(90);
    expect(defaultTTLDays("gdpr")).toBe(365);
    expect(defaultTTLDays("cis")).toBe(90);
    expect(defaultTTLDays("openssf")).toBe(90);
    expect(defaultTTLDays("eu-ai-act")).toBe(180);
  });

  it("returns default 90 for unknown frameworks", () => {
    expect(defaultTTLDays("unknown")).toBe(90);
  });
});

describe("canTransition", () => {
  it("allows valid transitions", () => {
    expect(canTransition("draft", "submit")).toBe(true);
    expect(canTransition("pending_review", "review_approve")).toBe(true);
    expect(canTransition("pending_review", "review_reject")).toBe(true);
    expect(canTransition("pending_approval", "final_approve")).toBe(true);
    expect(canTransition("pending_approval", "final_reject")).toBe(true);
    expect(canTransition("pending_approval", "review_changes")).toBe(true);
    expect(canTransition("approved", "expire")).toBe(true);
    expect(canTransition("approved", "supersede")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("draft", "review_approve")).toBe(false);
    expect(canTransition("draft", "final_approve")).toBe(false);
    expect(canTransition("approved", "submit")).toBe(false);
    expect(canTransition("rejected", "submit")).toBe(false);
    expect(canTransition("expired", "submit")).toBe(false);
    expect(canTransition("superseded", "submit")).toBe(false);
  });

  it("rejects unknown actions", () => {
    expect(canTransition("draft", "unknown_action")).toBe(false);
  });
});

describe("canUserAct", () => {
  const creator = "jane@acme.com";
  const reviewer = "bob@acme.com";
  const admin = "admin@acme.com";

  it("allows admin/manager to create", () => {
    expect(canUserAct("admin", creator, null, "create", admin)).toBe(true);
    expect(canUserAct("manager", creator, null, "create", reviewer)).toBe(true);
  });

  it("denies dev/viewer from creating", () => {
    expect(canUserAct("dev", creator, null, "create", "dev@acme.com")).toBe(false);
    expect(canUserAct("viewer", creator, null, "create", "viewer@acme.com")).toBe(false);
  });

  it("only creator with admin/manager role can submit", () => {
    expect(canUserAct("admin", creator, null, "submit", creator)).toBe(true);
    expect(canUserAct("manager", creator, null, "submit", creator)).toBe(true);
    // Non-creator cannot submit
    expect(canUserAct("admin", creator, null, "submit", admin)).toBe(false);
    // Dev cannot submit even if creator
    expect(canUserAct("dev", creator, null, "submit", creator)).toBe(false);
  });

  it("creator cannot review own attestation", () => {
    expect(canUserAct("admin", creator, null, "review_approve", creator)).toBe(false);
    expect(canUserAct("manager", creator, null, "review_approve", creator)).toBe(false);
  });

  it("non-creator admin/manager can review", () => {
    expect(canUserAct("admin", creator, null, "review_approve", reviewer)).toBe(true);
    expect(canUserAct("manager", creator, null, "review_approve", reviewer)).toBe(true);
  });

  it("final approve requires admin, cannot be creator or reviewer", () => {
    expect(canUserAct("admin", creator, reviewer, "final_approve", admin)).toBe(true);
    expect(canUserAct("admin", creator, reviewer, "final_approve", creator)).toBe(false);
    expect(canUserAct("admin", creator, reviewer, "final_approve", reviewer)).toBe(false);
    expect(canUserAct("manager", creator, reviewer, "final_approve", admin)).toBe(false);
  });
});
