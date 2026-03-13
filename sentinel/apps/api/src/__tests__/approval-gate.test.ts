import { describe, it, expect, vi } from "vitest";
import { shouldCreateApprovalGate } from "../approval-gate.js";

describe("shouldCreateApprovalGate", () => {
  it("returns null when no policies exist", async () => {
    const result = await shouldCreateApprovalGate({
      orgId: "org-1",
      scanId: "scan-1",
      projectId: "proj-1",
      riskScore: 50,
      findings: [],
      branch: "main",
      db: { approvalPolicy: { findMany: vi.fn().mockResolvedValue([]) } } as any,
    });
    expect(result).toBeNull();
  });

  it("returns requirement when policy matches", async () => {
    const mockPolicy = {
      id: "pol-1",
      name: "Risk Gate",
      enabled: true,
      priority: 0,
      strategyType: "risk_threshold",
      config: { autoPassBelow: 30, autoBlockAbove: 70 },
      assigneeRole: "manager",
      slaHours: 24,
      escalateAfterHours: 48,
      expiryAction: "reject",
      projectId: null,
    };
    const result = await shouldCreateApprovalGate({
      orgId: "org-1",
      scanId: "scan-1",
      projectId: "proj-1",
      riskScore: 50,
      findings: [],
      branch: "main",
      db: {
        approvalPolicy: { findMany: vi.fn().mockResolvedValue([mockPolicy]) },
      } as any,
    });
    expect(result).not.toBeNull();
    expect(result!.gateType).toBe("risk_threshold");
  });

  it("returns null when risk score is below threshold", async () => {
    const mockPolicy = {
      id: "pol-1",
      name: "Risk Gate",
      enabled: true,
      priority: 0,
      strategyType: "risk_threshold",
      config: { autoPassBelow: 30, autoBlockAbove: 70 },
      assigneeRole: "manager",
      slaHours: 24,
      escalateAfterHours: 48,
      expiryAction: "reject",
      projectId: null,
    };
    const result = await shouldCreateApprovalGate({
      orgId: "org-1",
      scanId: "scan-1",
      projectId: "proj-1",
      riskScore: 10,
      findings: [],
      branch: "feature/x",
      db: {
        approvalPolicy: { findMany: vi.fn().mockResolvedValue([mockPolicy]) },
      } as any,
    });
    expect(result).toBeNull();
  });
});
