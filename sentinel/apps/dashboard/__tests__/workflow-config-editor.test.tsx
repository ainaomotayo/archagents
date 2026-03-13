// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

import { WorkflowConfigEditor } from "@/components/remediations/workflow-config-editor";

const defaultProps = {
  initialSkipStages: [] as string[],
  onSave: vi.fn().mockResolvedValue(undefined),
};

describe("WorkflowConfigEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all pipeline stage labels", () => {
    render(<WorkflowConfigEditor {...defaultProps} />);
    // Labels appear in both the toggle section and the pipeline preview
    expect(screen.getAllByText("Assigned").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Review").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Awaiting Deployment").length).toBeGreaterThanOrEqual(1);
  });

  it("renders toggle switches for skippable stages (not for 'open' or 'completed')", () => {
    render(<WorkflowConfigEditor {...defaultProps} />);
    const switches = screen.getAllByRole("switch");
    // There should be exactly 4 toggle switches — one per skippable stage
    expect(switches).toHaveLength(4);
    const labels = switches.map((s) => s.getAttribute("aria-label"));
    expect(labels).toContain("Assigned stage");
    expect(labels).toContain("In Progress stage");
    expect(labels).toContain("In Review stage");
    expect(labels).toContain("Awaiting Deployment stage");
  });

  it("shows visual pipeline preview", () => {
    render(<WorkflowConfigEditor {...defaultProps} />);
    expect(screen.getByText("Pipeline Preview")).toBeDefined();
    // With no stages skipped, pipeline should show all 6 stages: Open + 4 skippable + Completed
    expect(screen.getByText("Open")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("shows save button", () => {
    render(<WorkflowConfigEditor {...defaultProps} />);
    expect(screen.getByText("Save Configuration")).toBeDefined();
  });
});
