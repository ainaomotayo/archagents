import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PRIORITY_STYLES,
  STATUS_STYLES,
  STATUS_LABELS,
  isOverdue,
  formatDueDate,
} from "@/components/remediations/remediation-card";
import type { RemediationItem } from "@/lib/types";

function makeItem(overrides: Partial<RemediationItem> = {}): RemediationItem {
  return {
    id: "rem-1",
    orgId: "org-1",
    frameworkSlug: null,
    controlCode: null,
    title: "Fix SQL injection in /api/users",
    description: "desc",
    status: "open",
    priority: "high",
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
    priorityScore: 85,
    externalRef: null,
    ...overrides,
  };
}

describe("PRIORITY_STYLES", () => {
  it("defines styles for critical, high, medium, low", () => {
    for (const p of ["critical", "high", "medium", "low"]) {
      const style = PRIORITY_STYLES[p];
      expect(style).toBeDefined();
      expect(style.bg).toBeTruthy();
      expect(style.text).toBeTruthy();
      expect(style.border).toBeTruthy();
    }
  });

  it("critical uses fail colors", () => {
    expect(PRIORITY_STYLES.critical.text).toContain("status-fail");
  });
});

describe("STATUS_STYLES", () => {
  it("defines styles for open, in_progress, completed, accepted_risk", () => {
    for (const s of ["open", "in_progress", "completed", "accepted_risk"]) {
      const style = STATUS_STYLES[s];
      expect(style).toBeDefined();
      expect(style.bg).toBeTruthy();
      expect(style.text).toBeTruthy();
      expect(style.dot).toBeTruthy();
    }
  });
});

describe("STATUS_LABELS", () => {
  it("maps status keys to human-readable labels", () => {
    expect(STATUS_LABELS.open).toBe("Open");
    expect(STATUS_LABELS.in_progress).toBe("In Progress");
    expect(STATUS_LABELS.completed).toBe("Completed");
    expect(STATUS_LABELS.accepted_risk).toBe("Accepted Risk");
  });
});

describe("isOverdue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when dueDate is in the past and status is open", () => {
    const item = makeItem({ dueDate: "2026-03-10T00:00:00Z", status: "open" });
    expect(isOverdue(item)).toBe(true);
  });

  it("returns true when dueDate is in the past and status is in_progress", () => {
    const item = makeItem({ dueDate: "2026-03-10T00:00:00Z", status: "in_progress" });
    expect(isOverdue(item)).toBe(true);
  });

  it("returns false when dueDate is in the future", () => {
    const item = makeItem({ dueDate: "2026-04-01T00:00:00Z", status: "open" });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns false when status is completed even if dueDate is past", () => {
    const item = makeItem({ dueDate: "2026-03-01T00:00:00Z", status: "completed" });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns false when status is accepted_risk even if dueDate is past", () => {
    const item = makeItem({ dueDate: "2026-03-01T00:00:00Z", status: "accepted_risk" });
    expect(isOverdue(item)).toBe(false);
  });

  it("returns false when dueDate is null", () => {
    const item = makeItem({ dueDate: null, status: "open" });
    expect(isOverdue(item)).toBe(false);
  });
});

describe("formatDueDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Xd overdue' for past dates", () => {
    const result = formatDueDate("2026-03-10T12:00:00Z");
    expect(result).toBe("3d overdue");
  });

  it("returns 'Due today' when diffDays rounds to 0", () => {
    // Math.ceil((target - now) / dayMs) === 0 when target is slightly in the past but same "day"
    // With ceil, even 1ms ahead rounds to 1 day. Use exact same time for 0.
    const result = formatDueDate("2026-03-13T12:00:00Z");
    expect(result).toBe("Due today");
  });

  it("returns 'Due tomorrow' for tomorrow", () => {
    const result = formatDueDate("2026-03-14T12:00:00Z");
    expect(result).toBe("Due tomorrow");
  });

  it("returns 'Xd left' for future dates beyond tomorrow", () => {
    const result = formatDueDate("2026-03-20T12:00:00Z");
    expect(result).toBe("7d left");
  });
});
