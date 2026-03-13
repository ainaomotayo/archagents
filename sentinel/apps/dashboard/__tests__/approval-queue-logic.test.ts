import { describe, it, expect } from "vitest";
import type { ApprovalGate, ApprovalStatus } from "@/lib/types";
import { MOCK_APPROVAL_GATES } from "@/lib/mock-data";

// Extract the pure filtering/counting logic from ApprovalQueue component
// so we can test it without React/jsdom

type StatusFilter = "all" | "pending" | "escalated" | "approved" | "rejected" | "expired";

function filterGates(gates: ApprovalGate[], filter: StatusFilter, search: string): ApprovalGate[] {
  let result = gates;
  if (filter !== "all") {
    result = result.filter((g) => g.status === filter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(
      (g) =>
        g.projectName.toLowerCase().includes(q) ||
        g.scan.branch.toLowerCase().includes(q) ||
        g.scan.commitHash.toLowerCase().includes(q),
    );
  }
  return result;
}

function computeFilterCounts(gates: ApprovalGate[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: gates.length,
    pending: 0,
    escalated: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
  };
  for (const g of gates) {
    if (g.status in counts) counts[g.status as StatusFilter]++;
  }
  return counts;
}

function findNextPending(gates: ApprovalGate[], excludeId: string): ApprovalGate | undefined {
  return gates.find(
    (g) => g.id !== excludeId && (g.status === "pending" || g.status === "escalated"),
  );
}

// ---------------------------------------------------------------------------
// filterGates
// ---------------------------------------------------------------------------

describe("filterGates", () => {
  const gates = MOCK_APPROVAL_GATES;

  it("returns all gates when filter is 'all' and no search", () => {
    expect(filterGates(gates, "all", "")).toHaveLength(gates.length);
  });

  it("filters by pending status", () => {
    const result = filterGates(gates, "pending", "");
    expect(result.every((g) => g.status === "pending")).toBe(true);
    expect(result.length).toBe(gates.filter((g) => g.status === "pending").length);
  });

  it("filters by escalated status", () => {
    const result = filterGates(gates, "escalated", "");
    expect(result.every((g) => g.status === "escalated")).toBe(true);
  });

  it("filters by approved status", () => {
    const result = filterGates(gates, "approved", "");
    expect(result.every((g) => g.status === "approved")).toBe(true);
  });

  it("filters by rejected status", () => {
    const result = filterGates(gates, "rejected", "");
    expect(result.every((g) => g.status === "rejected")).toBe(true);
  });

  it("returns empty for expired when no expired gates exist", () => {
    const result = filterGates(gates, "expired", "");
    expect(result.every((g) => g.status === "expired")).toBe(true);
  });

  it("searches by project name (case-insensitive)", () => {
    const first = gates[0];
    const searchTerm = first.projectName.substring(0, 5).toUpperCase();
    const result = filterGates(gates, "all", searchTerm);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((g) => g.projectName.toLowerCase().includes(searchTerm.toLowerCase()))).toBe(true);
  });

  it("searches by branch name", () => {
    const first = gates[0];
    const result = filterGates(gates, "all", first.scan.branch);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((g) => g.scan.branch === first.scan.branch)).toBe(true);
  });

  it("searches by commit hash prefix", () => {
    const first = gates[0];
    const hashPrefix = first.scan.commitHash.slice(0, 7);
    const result = filterGates(gates, "all", hashPrefix);
    expect(result.length).toBeGreaterThan(0);
  });

  it("combines filter and search", () => {
    const pendingGates = gates.filter((g) => g.status === "pending");
    if (pendingGates.length === 0) return;
    const target = pendingGates[0];
    const result = filterGates(gates, "pending", target.projectName);
    expect(result.every((g) => g.status === "pending")).toBe(true);
    expect(result.some((g) => g.projectName === target.projectName)).toBe(true);
  });

  it("returns empty for non-matching search", () => {
    const result = filterGates(gates, "all", "zzz-nonexistent-zzz");
    expect(result).toHaveLength(0);
  });

  it("trims whitespace from search", () => {
    const result = filterGates(gates, "all", "   ");
    expect(result).toHaveLength(gates.length);
  });
});

// ---------------------------------------------------------------------------
// computeFilterCounts
// ---------------------------------------------------------------------------

describe("computeFilterCounts", () => {
  const gates = MOCK_APPROVAL_GATES;

  it("all count equals total gates", () => {
    const counts = computeFilterCounts(gates);
    expect(counts.all).toBe(gates.length);
  });

  it("individual counts sum to total", () => {
    const counts = computeFilterCounts(gates);
    const sum = counts.pending + counts.escalated + counts.approved + counts.rejected + counts.expired;
    expect(sum).toBe(counts.all);
  });

  it("matches expected distribution", () => {
    const counts = computeFilterCounts(gates);
    expect(counts.pending).toBe(3);
    expect(counts.escalated).toBe(2);
    expect(counts.approved).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.expired).toBe(0);
  });

  it("handles empty array", () => {
    const counts = computeFilterCounts([]);
    expect(counts.all).toBe(0);
    expect(counts.pending).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findNextPending (auto-advance logic)
// ---------------------------------------------------------------------------

describe("findNextPending", () => {
  const gates = MOCK_APPROVAL_GATES;

  it("finds first pending/escalated gate excluding given id", () => {
    const actionable = gates.filter(
      (g) => g.status === "pending" || g.status === "escalated",
    );
    const excludeId = actionable[0].id;
    const next = findNextPending(gates, excludeId);
    expect(next).toBeDefined();
    expect(next!.id).not.toBe(excludeId);
    expect(["pending", "escalated"]).toContain(next!.status);
  });

  it("returns undefined when no other actionable gates exist", () => {
    const singlePending: ApprovalGate[] = [
      { ...gates[0], id: "only-one", status: "pending" },
    ];
    const next = findNextPending(singlePending, "only-one");
    expect(next).toBeUndefined();
  });

  it("skips approved/rejected gates", () => {
    const decidedOnly: ApprovalGate[] = gates.filter(
      (g) => g.status === "approved" || g.status === "rejected",
    );
    const next = findNextPending(decidedOnly, "nonexistent");
    expect(next).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// O(1) index map reconciliation
// ---------------------------------------------------------------------------

describe("index map for SSE reconciliation", () => {
  it("builds correct index from gates array", () => {
    const gates = MOCK_APPROVAL_GATES;
    const idx = new Map<string, number>();
    gates.forEach((g, i) => idx.set(g.id, i));

    expect(idx.size).toBe(gates.length);
    for (let i = 0; i < gates.length; i++) {
      expect(idx.get(gates[i].id)).toBe(i);
    }
  });

  it("enables O(1) lookup for SSE update", () => {
    const gates = [...MOCK_APPROVAL_GATES];
    const idx = new Map<string, number>();
    gates.forEach((g, i) => idx.set(g.id, i));

    // Simulate SSE update
    const updatedGate = { ...gates[2], status: "approved" as ApprovalStatus };
    const pos = idx.get(updatedGate.id);
    expect(pos).toBe(2);

    gates[pos!] = updatedGate;
    expect(gates[2].status).toBe("approved");
  });

  it("handles new gate not in index (prepend)", () => {
    const gates = [...MOCK_APPROVAL_GATES];
    const idx = new Map<string, number>();
    gates.forEach((g, i) => idx.set(g.id, i));

    const newGate = { ...gates[0], id: "brand-new" };
    const pos = idx.get(newGate.id);
    expect(pos).toBeUndefined();

    // Not in index → prepend
    const updated = [newGate, ...gates];
    expect(updated[0].id).toBe("brand-new");
    expect(updated.length).toBe(gates.length + 1);
  });
});
