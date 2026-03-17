// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { AttributionTable } from "../components/attribution-table";
import type { FileAttribution } from "@/lib/types";

const mockAttributions: FileAttribution[] = [
  {
    id: "attr-1",
    certificateId: "cert-1",
    file: "src/index.ts",
    classification: "human",
    confidence: 0.95,
    primarySource: "git-history",
    toolName: null,
    toolModel: null,
    loc: 120,
    fusionMethod: "weighted",
    conflicting: false,
  },
  {
    id: "attr-2",
    certificateId: "cert-1",
    file: "src/utils.ts",
    classification: "ai-generated",
    confidence: 0.87,
    primarySource: "code-pattern",
    toolName: "copilot",
    toolModel: "gpt-4",
    loc: 45,
    fusionMethod: "weighted",
    conflicting: false,
  },
  {
    id: "attr-3",
    certificateId: "cert-1",
    file: "src/lib.ts",
    classification: "ai-assisted",
    confidence: 0.72,
    primarySource: "metadata",
    toolName: "cursor",
    toolModel: null,
    loc: 200,
    fusionMethod: "majority",
    conflicting: true,
  },
];

// Mock the dynamic import of @/lib/api
vi.mock("@/lib/api", () => ({
  getIPAttributions: vi.fn().mockResolvedValue([]),
}));

afterEach(() => cleanup());

beforeEach(async () => {
  vi.clearAllMocks();
  const api = await import("@/lib/api");
  (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("AttributionTable", () => {
  it("exports a function component", () => {
    expect(typeof AttributionTable).toBe("function");
  });

  it("shows empty state when no attributions are returned", async () => {
    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    expect(screen.getByText("No file attributions available.")).toBeDefined();
  });

  it("renders a table with file attributions", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    // Wait for the useEffect to resolve
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByText("src/index.ts")).toBeDefined();
    expect(screen.getByText("src/utils.ts")).toBeDefined();
    expect(screen.getByText("src/lib.ts")).toBeDefined();
  });

  it("displays classification badges", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getAllByText("human").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ai-generated").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ai-assisted").length).toBeGreaterThanOrEqual(1);
  });

  it("displays tool names or em-dash when null", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getAllByText("copilot").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("cursor").length).toBeGreaterThanOrEqual(1);
    // em-dash for null toolName
    expect(screen.getAllByText("\u2014").length).toBeGreaterThanOrEqual(1);
  });

  it("displays confidence percentages", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getAllByText("95%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("87%").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("72%").length).toBeGreaterThanOrEqual(1);
  });

  it("renders column headers", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // The table has 6 columns: File, Classification, Confidence, Tool, Source, LOC
    const table = screen.getByRole("table");
    const headers = table.querySelectorAll("th");
    expect(headers.length).toBe(6);
  });

  it("sorts by file name when File header is clicked", async () => {
    const api = await import("@/lib/api");
    (api.getIPAttributions as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockAttributions,
    );

    await act(async () => {
      render(<AttributionTable scanId="scan-1" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Default sort is by file asc: index.ts, lib.ts, utils.ts
    const rows = screen.getAllByRole("row");
    // row[0] is header, rows 1-3 are data
    const cells = rows[1].querySelectorAll("td");
    expect(cells[0].textContent).toBe("src/index.ts");

    // Click File header to toggle to desc
    const fileHeader = screen.getAllByRole("columnheader")[0];
    await act(async () => {
      fireEvent.click(fileHeader);
    });

    const rowsAfter = screen.getAllByRole("row");
    const cellsAfter = rowsAfter[1].querySelectorAll("td");
    expect(cellsAfter[0].textContent).toBe("src/utils.ts");
  });
});
