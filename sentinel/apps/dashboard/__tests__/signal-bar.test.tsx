// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalBar } from "../components/signal-bar";

describe("SignalBar", () => {
  it("renders signal name and formula", () => {
    const { container } = render(
      <SignalBar
        name="markers"
        weight={0.35}
        probability={0.8}
        contribution={0.28}
        overallScore={0.72}
      />,
    );
    expect(screen.getByText("markers")).toBeDefined();
    expect(container.textContent).toContain("35%");
    expect(container.textContent).toContain("0.80");
    expect(container.textContent).toContain("28%");
  });

  it("uses error color for high contribution", () => {
    const { container } = render(
      <SignalBar
        name="markers"
        weight={0.35}
        probability={0.8}
        contribution={0.28}
        overallScore={0.72}
      />,
    );
    const bar = container.querySelector("[class*='bg-status-error']");
    expect(bar).not.toBeNull();
  });

  it("uses tertiary color for low contribution", () => {
    const { container } = render(
      <SignalBar
        name="uniformity"
        weight={0.2}
        probability={0.3}
        contribution={0.06}
        overallScore={0.72}
      />,
    );
    const bar = container.querySelector("[class*='bg-text-tertiary']");
    expect(bar).not.toBeNull();
  });
});
