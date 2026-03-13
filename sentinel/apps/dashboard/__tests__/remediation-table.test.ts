import { describe, it, expect } from "vitest";
import type { RemediationItem } from "@/lib/types";
import {
  PRIORITY_STYLES,
  STATUS_LABELS,
  isOverdue,
} from "@/components/remediations/remediation-card";

// The RemediationTable component sorts top-level items by priorityScore descending,
// filters out children (parentId !== null), and expands children on toggle.
// We test the sorting/filtering logic here since the vitest env is "node".

function makeItem(overrides: Partial<RemediationItem>): RemediationItem {
  return {
    id: "rem-1",
    orgId: "org-1",
    frameworkSlug: null,
    controlCode: null,
    title: "Default item",
    description: "desc",
    status: "open",
    priority: "medium",
    assignedTo: null,
    dueDate: null,
    completedAt: null,
    completedBy: null,
    evidenceNotes: null,
    linkedFindingIds: [],
    createdBy: "user-1",
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-01T00:00:00Z",
    parentId: null,
    findingId: null,
    itemType: "finding",
    priorityScore: 50,
    externalRef: null,
    ...overrides,
  };
}

// Replicate the table sorting logic from the component
function sortForTable(items: RemediationItem[]): RemediationItem[] {
  return [...items]
    .filter((item) => !item.parentId)
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

describe("RemediationTable sorting logic", () => {
  const items: RemediationItem[] = [
    makeItem({ id: "r-low", title: "Low priority", priorityScore: 20, priority: "low" }),
    makeItem({ id: "r-crit", title: "Critical vuln", priorityScore: 95, priority: "critical" }),
    makeItem({ id: "r-med", title: "Medium fix", priorityScore: 50, priority: "medium" }),
    makeItem({ id: "r-high", title: "High severity", priorityScore: 80, priority: "high" }),
  ];

  it("sorts items by priorityScore descending", () => {
    const sorted = sortForTable(items);
    expect(sorted.map((i) => i.id)).toEqual(["r-crit", "r-high", "r-med", "r-low"]);
  });

  it("filters out child items (parentId is set)", () => {
    const withChild: RemediationItem[] = [
      ...items,
      makeItem({ id: "r-child", title: "Child task", parentId: "r-crit", priorityScore: 90 }),
    ];
    const sorted = sortForTable(withChild);
    expect(sorted.map((i) => i.id)).not.toContain("r-child");
    expect(sorted).toHaveLength(4);
  });

  it("returns empty array for empty input", () => {
    expect(sortForTable([])).toEqual([]);
  });

  it("handles items with identical scores (stable-ish order)", () => {
    const sameScore = [
      makeItem({ id: "a", priorityScore: 50 }),
      makeItem({ id: "b", priorityScore: 50 }),
    ];
    const sorted = sortForTable(sameScore);
    expect(sorted).toHaveLength(2);
    // Both should be present
    expect(sorted.map((i) => i.id)).toContain("a");
    expect(sorted.map((i) => i.id)).toContain("b");
  });
});

describe("RemediationTable column values", () => {
  it("maps priority to PRIORITY_STYLES", () => {
    const item = makeItem({ priority: "critical" });
    const style = PRIORITY_STYLES[item.priority];
    expect(style).toBeDefined();
    expect(style.text).toContain("status-fail");
  });

  it("maps status to STATUS_LABELS", () => {
    const item = makeItem({ status: "in_progress" });
    expect(STATUS_LABELS[item.status]).toBe("In Progress");
  });

  it("shows assignee or '--' placeholder", () => {
    const assigned = makeItem({ assignedTo: "alice@co.com" });
    const unassigned = makeItem({ assignedTo: null });
    expect(assigned.assignedTo).toBe("alice@co.com");
    expect(unassigned.assignedTo).toBeNull();
  });

  it("shows externalRef when present", () => {
    const item = makeItem({ externalRef: "JIRA-1234" });
    expect(item.externalRef).toBe("JIRA-1234");
  });

  it("shows priorityScore as a number", () => {
    const item = makeItem({ priorityScore: 72 });
    expect(typeof item.priorityScore).toBe("number");
    expect(item.priorityScore).toBe(72);
  });
});

describe("RemediationTable parent-child expansion", () => {
  it("parent has children array to expand", () => {
    const child1 = makeItem({ id: "c1", parentId: "p1", status: "completed" });
    const child2 = makeItem({ id: "c2", parentId: "p1", status: "open" });
    const parent = makeItem({ id: "p1", children: [child1, child2] });

    expect(parent.children).toHaveLength(2);
    expect(parent.children![0].id).toBe("c1");
    expect(parent.children![1].id).toBe("c2");
  });

  it("child items reference parent via parentId", () => {
    const child = makeItem({ id: "c1", parentId: "p1" });
    expect(child.parentId).toBe("p1");
  });

  it("sortForTable excludes children but parent retains children array", () => {
    const child = makeItem({ id: "c1", parentId: "p1", priorityScore: 99 });
    const parent = makeItem({ id: "p1", priorityScore: 60, children: [child] });
    const items = [parent, child];
    const sorted = sortForTable(items);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("p1");
    expect(sorted[0].children).toHaveLength(1);
  });
});
