import { describe, it, expect } from "vitest";
import { renderReport } from "../report-renderer.js";
import { ReportRegistry } from "@sentinel/compliance";
import { createElement } from "react";
import { Document, Page, Text } from "@react-pdf/renderer";

describe("renderReport", () => {
  it("renders a PDF buffer from a template", async () => {
    const registry = new ReportRegistry();
    registry.register({
      type: "test",
      displayName: "Test",
      description: "test",
      gather: async () => ({ title: "Hello" }),
      render: (data: any) =>
        createElement(
          Document,
          null,
          createElement(Page, null, createElement(Text, null, data.title)),
        ),
    });

    const result = await renderReport(
      registry,
      "test",
      { title: "Hello" },
      {
        orgName: "Acme",
        accentColor: "#2563EB",
        footerText: "test",
      },
    );

    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.buffer.slice(0, 5).toString()).toBe("%PDF-");
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.fileSize).toBe(result.buffer.length);
  });

  it("throws for unknown template type", async () => {
    const registry = new ReportRegistry();
    await expect(
      renderReport(registry, "unknown", {}, {
        orgName: "Acme",
        accentColor: "#2563EB",
        footerText: "test",
      }),
    ).rejects.toThrow("Unknown report type");
  });
});
