// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the API module using the alias path (matches the component's import)
vi.mock("@/lib/api", () => ({
  getDecisionTrace: vi.fn(),
}));

import { getDecisionTrace } from "../lib/api";
import { DecisionTraceCard } from "../components/decision-trace-card";

const mockTrace = {
  id: "t1",
  findingId: "f1",
  toolName: "copilot",
  modelVersion: null,
  promptHash: null,
  promptCategory: "code-completion",
  overallScore: 0.72,
  signals: {
    markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
  },
  declaredTool: null,
  declaredModel: null,
  enrichedAt: null,
};

describe("DecisionTraceCard", () => {
  it("renders trace card with signal bars", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(mockTrace);
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    expect(screen.getByText("AI Decision Trace")).toBeDefined();
    expect(screen.getByText("copilot")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
    expect(screen.getByText("markers")).toBeDefined();
    expect(screen.getByText("entropy")).toBeDefined();
  });

  it("returns null when no trace exists", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(null);
    const jsx = await DecisionTraceCard({ findingId: "f2" });
    expect(jsx).toBeNull();
  });

  it("shows dash for null fields", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(mockTrace);
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    // modelVersion is null, should show em-dash
    const cells = container.querySelectorAll("p");
    const modelCell = Array.from(cells).find((p) => p.textContent === "\u2014");
    expect(modelCell).toBeDefined();
  });

  it("shows enrichment section when declared tool exists", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue({
      ...mockTrace,
      declaredTool: "cursor",
      declaredModel: "claude-sonnet-4-20250514",
      enrichedAt: "2026-03-14T14:30:00Z",
    });
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    expect(container.textContent).toContain("cursor");
    expect(container.textContent).toContain("claude-sonnet-4-20250514");
    expect(container.textContent).toContain("Enriched");
  });
});
