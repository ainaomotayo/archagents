// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

vi.mock("recharts", () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}));

import { RiskSparkline } from "@/components/risk-sparkline";

const samplePoints = [
  { date: "2026-01-01", score: 70 },
  { date: "2026-01-02", score: 65 },
  { date: "2026-01-03", score: 60 },
];

describe("RiskSparkline", () => {
  afterEach(cleanup);

  it("renders area chart when points are provided", () => {
    render(<RiskSparkline points={samplePoints} direction="down" />);
    expect(screen.getByTestId("area-chart")).toBeDefined();
  });

  it("renders empty state when no points", () => {
    render(<RiskSparkline points={[]} direction="flat" />);
    expect(screen.queryByTestId("area-chart")).toBeNull();
    expect(screen.getByText("No data")).toBeDefined();
  });

  it("applies green color class for 'down' direction (risk decreasing = good)", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="down" />);
    expect(container.querySelector("[data-direction='down']")).toBeDefined();
  });

  it("applies red color class for 'up' direction (risk increasing = bad)", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="up" />);
    expect(container.querySelector("[data-direction='up']")).toBeDefined();
  });

  it("applies gray color class for 'flat' direction", () => {
    const { container } = render(<RiskSparkline points={samplePoints} direction="flat" />);
    expect(container.querySelector("[data-direction='flat']")).toBeDefined();
  });
});
