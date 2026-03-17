// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProvenanceBar } from "../components/provenance-bar";

const zeroClassifications = () => ({
  human: { files: 0, loc: 0, percentage: 0 },
  aiGenerated: { files: 0, loc: 0, percentage: 0 },
  aiAssisted: { files: 0, loc: 0, percentage: 0 },
  mixed: { files: 0, loc: 0, percentage: 0 },
  unknown: { files: 0, loc: 0, percentage: 0 },
});

const makeClassifications = (
  overrides: Partial<
    Record<string, { files: number; loc: number; percentage: number }>
  > = {},
) => ({
  human: { files: 5, loc: 500, percentage: 0.5, ...overrides.human },
  aiGenerated: {
    files: 3,
    loc: 300,
    percentage: 0.3,
    ...overrides.aiGenerated,
  },
  aiAssisted: { files: 1, loc: 100, percentage: 0.1, ...overrides.aiAssisted },
  mixed: { files: 1, loc: 50, percentage: 0.1, ...overrides.mixed },
  unknown: { files: 0, loc: 0, percentage: 0, ...overrides.unknown },
});

afterEach(() => cleanup());

describe("ProvenanceBar", () => {
  it("exports a function component", () => {
    expect(typeof ProvenanceBar).toBe("function");
  });

  it("returns null for zero-file classifications", () => {
    const { container } = render(
      <ProvenanceBar classifications={zeroClassifications()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders provenance distribution bar for non-zero classifications", () => {
    render(<ProvenanceBar classifications={makeClassifications()} />);
    const bar = screen.getByRole("img", { name: /provenance distribution/i });
    expect(bar).toBeDefined();
  });

  it("renders a segment for each non-zero classification", () => {
    const { container } = render(
      <ProvenanceBar classifications={makeClassifications()} />,
    );
    // 4 non-zero entries: human(5), aiGenerated(3), aiAssisted(1), mixed(1) — unknown is 0
    const bar = container.querySelector('[role="img"]')!;
    expect(bar.children.length).toBe(4);
  });

  it("does not render a segment for zero-file entries", () => {
    const classifications = makeClassifications();
    // unknown has 0 files by default
    const { container } = render(
      <ProvenanceBar classifications={classifications} />,
    );
    const bar = container.querySelector('[role="img"]')!;
    // Should not find a segment with title containing "Unknown"
    const unknownSegment = Array.from(bar.children).find((el) =>
      el.getAttribute("title")?.includes("Unknown"),
    );
    expect(unknownSegment).toBeUndefined();
  });

  it("computes correct width percentages based on file counts", () => {
    const classifications = makeClassifications();
    // total = 5 + 3 + 1 + 1 = 10
    const { container } = render(
      <ProvenanceBar classifications={classifications} />,
    );
    const bar = container.querySelector('[role="img"]')!;
    const segments = Array.from(bar.children) as HTMLElement[];
    // human: 5/10 = 50%
    expect(segments[0].style.width).toBe("50%");
    // aiGenerated: 3/10 = 30%
    expect(segments[1].style.width).toBe("30%");
  });

  it("shows title with label, file count and percentage for each segment", () => {
    const { container } = render(
      <ProvenanceBar classifications={makeClassifications()} />,
    );
    const bar = container.querySelector('[role="img"]')!;
    const segments = Array.from(bar.children) as HTMLElement[];
    expect(segments[0].getAttribute("title")).toBe(
      "Human: 5 files (50%)",
    );
    expect(segments[1].getAttribute("title")).toBe(
      "AI-Generated: 3 files (30%)",
    );
  });

  it("renders legend labels for non-zero entries", () => {
    const { container } = render(
      <ProvenanceBar classifications={makeClassifications()} />,
    );
    const legend = container.querySelectorAll(
      ".flex.flex-wrap span",
    );
    const labels = Array.from(legend).map((el) => el.textContent);
    expect(labels).toContain("Human: 5");
    expect(labels).toContain("AI-Generated: 3");
    expect(labels).toContain("AI-Assisted: 1");
    expect(labels).toContain("Mixed: 1");
    // unknown should not appear
    expect(labels.find((l) => l?.includes("Unknown"))).toBeUndefined();
  });

  it("renders all five segments when every category has files", () => {
    const all = makeClassifications({
      unknown: { files: 2, loc: 20, percentage: 0.05 },
    });
    const { container } = render(<ProvenanceBar classifications={all} />);
    const bar = container.querySelector('[role="img"]')!;
    expect(bar.children.length).toBe(5);
  });
});
