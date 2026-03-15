import { describe, it, expect } from "vitest";
import { computePriorityScore } from "../remediation/priority-score.js";

describe("computePriorityScore", () => {
  it("returns base score for critical priority with no due date", () => {
    expect(computePriorityScore({ priority: "critical", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(40);
  });

  it("returns base score for low priority with no due date", () => {
    expect(computePriorityScore({ priority: "low", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(5);
  });

  it("adds max SLA urgency (40) for overdue items", () => {
    const pastDate = new Date(Date.now() - 86400000);
    const score = computePriorityScore({ priority: "low", dueDate: pastDate, linkedFindingIds: [], findingId: null });
    expect(score).toBe(45); // 5 base + 40 overdue
  });

  it("adds blast radius for linked findings", () => {
    const score = computePriorityScore({ priority: "medium", dueDate: null, linkedFindingIds: ["f1", "f2", "f3"], findingId: null });
    expect(score).toBe(27); // 15 base + 0 sla + 12 blast (3*4)
  });

  it("counts findingId in blast radius", () => {
    const score = computePriorityScore({ priority: "medium", dueDate: null, linkedFindingIds: ["f1"], findingId: "f2" });
    expect(score).toBe(23); // 15 base + 0 sla + 8 blast (2*4)
  });

  it("caps blast radius at 20", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `f${i}`);
    const score = computePriorityScore({ priority: "low", dueDate: null, linkedFindingIds: ids, findingId: null });
    expect(score).toBe(25); // 5 base + 0 sla + 20 blast (capped)
  });

  it("caps total score at 100", () => {
    const pastDate = new Date(Date.now() - 86400000);
    const ids = Array.from({ length: 10 }, (_, i) => `f${i}`);
    const score = computePriorityScore({ priority: "critical", dueDate: pastDate, linkedFindingIds: ids, findingId: null });
    expect(score).toBe(100); // 40+40+20 = 100
  });

  it("returns 15 for unknown priority (defaults to medium)", () => {
    expect(computePriorityScore({ priority: "unknown", dueDate: null, linkedFindingIds: [], findingId: null })).toBe(15);
  });
});
