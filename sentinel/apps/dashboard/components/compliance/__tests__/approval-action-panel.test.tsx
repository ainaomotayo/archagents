import { describe, it, expect } from "vitest";
import { canUserAct } from "../attestation-types";

describe("ApprovalActionPanel RBAC", () => {
  const creator = "jane@acme.com";
  const reviewer = "bob@acme.com";
  const admin = "admin@acme.com";
  const otherManager = "manager2@acme.com";

  describe("review stage", () => {
    it("admin can approve if not creator", () => {
      expect(canUserAct("admin", creator, null, "review_approve", admin)).toBe(true);
    });

    it("manager can approve if not creator", () => {
      expect(canUserAct("manager", creator, null, "review_approve", otherManager)).toBe(true);
    });

    it("creator cannot review own attestation", () => {
      expect(canUserAct("admin", creator, null, "review_approve", creator)).toBe(false);
    });

    it("dev cannot review", () => {
      expect(canUserAct("dev", creator, null, "review_approve", "dev@acme.com")).toBe(false);
    });

    it("can reject if not creator", () => {
      expect(canUserAct("admin", creator, null, "review_reject", admin)).toBe(true);
    });

    it("can request changes if not creator", () => {
      expect(canUserAct("manager", creator, null, "review_changes", otherManager)).toBe(true);
    });
  });

  describe("final approval stage", () => {
    it("admin can final approve if not creator or reviewer", () => {
      expect(canUserAct("admin", creator, reviewer, "final_approve", admin)).toBe(true);
    });

    it("creator cannot final approve", () => {
      expect(canUserAct("admin", creator, reviewer, "final_approve", creator)).toBe(false);
    });

    it("reviewer cannot final approve", () => {
      expect(canUserAct("admin", creator, reviewer, "final_approve", reviewer)).toBe(false);
    });

    it("manager cannot final approve (admin only)", () => {
      expect(canUserAct("manager", creator, reviewer, "final_approve", otherManager)).toBe(false);
    });

    it("admin can final reject if not creator or reviewer", () => {
      expect(canUserAct("admin", creator, reviewer, "final_reject", admin)).toBe(true);
    });
  });
});
