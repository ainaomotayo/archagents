import { describe, it, expect } from "vitest";
import {
  evaluateApprovalPolicies,
  type PolicyConfig,
  type PolicyInput,
} from "../approval-policy.js";

function makeInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    riskScore: 50,
    findings: [],
    branch: "main",
    projectId: "proj-1",
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    id: "pol-1",
    name: "Test Policy",
    enabled: true,
    priority: 0,
    strategyType: "risk_threshold",
    config: { autoPassBelow: 30, autoBlockAbove: 70 },
    assigneeRole: "manager",
    slaHours: 24,
    escalateAfterHours: 48,
    expiryAction: "reject",
    projectId: null,
    ...overrides,
  };
}

describe("evaluateApprovalPolicies", () => {
  describe("risk_threshold strategy", () => {
    it("returns null (auto-pass) when risk score is below autoPassBelow", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ riskScore: 10 }),
        [makePolicy()],
      );
      expect(result).toBeNull();
    });

    it("returns requirement when risk score is in review range", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ riskScore: 50 }),
        [makePolicy()],
      );
      expect(result).not.toBeNull();
      expect(result!.gateType).toBe("risk_threshold");
      expect(result!.assigneeRole).toBe("manager");
    });

    it("returns auto-block when risk score exceeds autoBlockAbove", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ riskScore: 80 }),
        [makePolicy()],
      );
      expect(result).not.toBeNull();
      expect(result!.autoBlock).toBe(true);
    });
  });

  describe("category_block strategy", () => {
    it("returns requirement when finding matches category + severity", () => {
      const result = evaluateApprovalPolicies(
        makeInput({
          findings: [
            { type: "license", severity: "critical", category: "copyleft-risk" } as any,
          ],
        }),
        [
          makePolicy({
            strategyType: "category_block",
            config: { categories: ["copyleft-risk"], severities: ["critical", "high"] },
          }),
        ],
      );
      expect(result).not.toBeNull();
      expect(result!.gateType).toBe("category_block");
    });

    it("returns null when no findings match", () => {
      const result = evaluateApprovalPolicies(
        makeInput({
          findings: [
            { type: "security", severity: "low", category: "xss" } as any,
          ],
        }),
        [
          makePolicy({
            strategyType: "category_block",
            config: { categories: ["copyleft-risk"], severities: ["critical"] },
          }),
        ],
      );
      expect(result).toBeNull();
    });
  });

  describe("license_review strategy", () => {
    it("requires review when finding has matching license", () => {
      const result = evaluateApprovalPolicies(
        makeInput({
          findings: [
            { type: "license", severity: "high", category: "copyleft-risk", licenseDetected: "GPL-3.0" } as any,
          ],
        }),
        [
          makePolicy({
            strategyType: "license_review",
            config: { licenses: ["GPL-3.0", "AGPL-3.0"] },
          }),
        ],
      );
      expect(result).not.toBeNull();
      expect(result!.gateType).toBe("license_review");
    });
  });

  describe("always_review strategy", () => {
    it("requires review when branch matches pattern", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ branch: "main" }),
        [
          makePolicy({
            strategyType: "always_review",
            config: { branches: ["main", "release/*"] },
          }),
        ],
      );
      expect(result).not.toBeNull();
      expect(result!.gateType).toBe("always_review");
    });

    it("returns null when branch does not match", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ branch: "feature/foo" }),
        [
          makePolicy({
            strategyType: "always_review",
            config: { branches: ["main"] },
          }),
        ],
      );
      expect(result).toBeNull();
    });
  });

  describe("policy ordering", () => {
    it("highest priority policy wins", () => {
      const result = evaluateApprovalPolicies(makeInput({ riskScore: 50 }), [
        makePolicy({ id: "low", priority: 0, assigneeRole: "developer" }),
        makePolicy({ id: "high", priority: 10, assigneeRole: "admin" }),
      ]);
      expect(result).not.toBeNull();
      expect(result!.assigneeRole).toBe("admin");
      expect(result!.policyId).toBe("high");
    });

    it("skips disabled policies", () => {
      const result = evaluateApprovalPolicies(makeInput({ riskScore: 50 }), [
        makePolicy({ enabled: false }),
      ]);
      expect(result).toBeNull();
    });

    it("project-specific policy overrides org-wide", () => {
      const result = evaluateApprovalPolicies(
        makeInput({ riskScore: 50, projectId: "proj-1" }),
        [
          makePolicy({ id: "org", projectId: null, priority: 0, assigneeRole: "manager" }),
          makePolicy({ id: "proj", projectId: "proj-1", priority: 0, assigneeRole: "admin" }),
        ],
      );
      expect(result).not.toBeNull();
      expect(result!.policyId).toBe("proj");
    });
  });
});
