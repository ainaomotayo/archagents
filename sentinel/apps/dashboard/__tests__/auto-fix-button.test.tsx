// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import type { RemediationItem } from "@/lib/types";

vi.mock("@/app/(dashboard)/remediations/actions", () => ({
  triggerAutoFixAction: vi.fn(),
}));

import { AutoFixButton } from "@/components/remediations/auto-fix-button";

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

describe("AutoFixButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when item has no findingId", () => {
    const { container } = render(<AutoFixButton item={makeItem({ findingId: null })} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders 'Auto-Fix' button when item has findingId", () => {
    render(<AutoFixButton item={makeItem({ findingId: "finding-123" })} />);
    expect(screen.getByText("Auto-Fix")).toBeDefined();
  });

  it("shows disabled message when item already has externalRef", () => {
    render(
      <AutoFixButton
        item={makeItem({ findingId: "finding-123", externalRef: "PR-42" })}
      />,
    );
    expect(
      screen.getByText(/Auto-fix disabled: this item already has an external reference/),
    ).toBeDefined();
    expect(screen.getByText(/PR-42/)).toBeDefined();
  });

  it("button is disabled when item has externalRef", () => {
    render(
      <AutoFixButton
        item={makeItem({ findingId: "finding-123", externalRef: "PR-42" })}
      />,
    );
    const button = screen.getByText("Auto-Fix").closest("button")!;
    expect(button.disabled).toBe(true);
  });
});
