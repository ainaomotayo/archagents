// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import type { BurndownDataPoint } from "@/lib/types";

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Legend: () => null,
}));

import { BurndownChart } from "@/components/remediations/burndown-chart";

const sampleData: BurndownDataPoint[] = [
  { date: "2026-03-01", open: 10, inProgress: 5 },
  { date: "2026-03-02", open: 8, inProgress: 6 },
  { date: "2026-03-03", open: 6, inProgress: 4 },
];

const defaultProps = {
  onRefresh: vi.fn().mockResolvedValue([]),
};

describe("BurndownChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders chart title 'Burndown'", () => {
    render(<BurndownChart {...defaultProps} initialData={sampleData} />);
    expect(screen.getByText("Burndown")).toBeDefined();
  });

  it("shows date range preset buttons (30d, 60d, 90d)", () => {
    render(<BurndownChart {...defaultProps} initialData={sampleData} />);
    expect(screen.getByText("30d")).toBeDefined();
    expect(screen.getByText("60d")).toBeDefined();
    expect(screen.getByText("90d")).toBeDefined();
  });

  it("shows scope selector with All/Framework/Team options", () => {
    render(<BurndownChart {...defaultProps} initialData={sampleData} />);
    const select = document.querySelector("select") as HTMLSelectElement;
    expect(select).toBeDefined();
    const options = Array.from(select.querySelectorAll("option"));
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("All");
    expect(labels).toContain("Framework");
    expect(labels).toContain("Team");
  });

  it("shows 'No data available' when initialData is empty", () => {
    render(<BurndownChart {...defaultProps} initialData={[]} />);
    expect(screen.getByText("No data available")).toBeDefined();
  });
});
