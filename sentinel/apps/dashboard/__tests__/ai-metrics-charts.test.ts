import { describe, it, expect } from "vitest";
import {
  TOOL_COLORS,
  getToolColor,
  PERIOD_PRESETS,
} from "@/components/ai-metrics/ai-tool-breakdown-chart";

describe("TOOL_COLORS", () => {
  it("has curated colors for known tools", () => {
    expect(TOOL_COLORS.copilot).toBe("#2563eb");
    expect(TOOL_COLORS.claude).toBe("#f97316");
    expect(TOOL_COLORS.cursor).toBe("#8b5cf6");
    expect(TOOL_COLORS.chatgpt).toBe("#22c55e");
    expect(TOOL_COLORS.codewhisperer).toBe("#ec4899");
    expect(TOOL_COLORS.devin).toBe("#06b6d4");
    expect(TOOL_COLORS.unknown).toBe("#6b7280");
  });
});

describe("getToolColor", () => {
  it("returns curated color for known tool", () => {
    expect(getToolColor("copilot")).toBe("#2563eb");
  });

  it("is case-insensitive", () => {
    expect(getToolColor("Copilot")).toBe("#2563eb");
    expect(getToolColor("CLAUDE")).toBe("#f97316");
  });

  it("returns generic color for unknown tool", () => {
    expect(getToolColor("some-new-tool")).toBe("#6b7280");
  });
});

describe("PERIOD_PRESETS", () => {
  it("has 4 presets: 30d, 90d, 6m, 1y", () => {
    expect(PERIOD_PRESETS).toHaveLength(4);
    expect(PERIOD_PRESETS.map((p) => p.label)).toEqual(["30d", "90d", "6m", "1y"]);
    expect(PERIOD_PRESETS.map((p) => p.days)).toEqual([30, 90, 180, 365]);
  });
});
