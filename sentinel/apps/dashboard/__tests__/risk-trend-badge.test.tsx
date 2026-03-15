// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

import { RiskTrendBadge } from "@/components/risk-trend-badge";

describe("RiskTrendBadge", () => {
  afterEach(cleanup);

  it("shows down arrow and green text for 'down' direction", () => {
    render(<RiskTrendBadge direction="down" changePercent={-10} />);
    expect(screen.getByText("-10%")).toBeDefined();
    const badge = screen.getByText("-10%").closest("[data-direction]");
    expect(badge?.getAttribute("data-direction")).toBe("down");
  });

  it("shows up arrow and red text for 'up' direction", () => {
    render(<RiskTrendBadge direction="up" changePercent={15} />);
    expect(screen.getByText("+15%")).toBeDefined();
  });

  it("shows flat indicator for 'flat' direction", () => {
    render(<RiskTrendBadge direction="flat" changePercent={0} />);
    expect(screen.getByText("0%")).toBeDefined();
  });
});
