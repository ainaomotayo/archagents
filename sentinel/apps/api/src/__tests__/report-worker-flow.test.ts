import { describe, it, expect } from "vitest";
import { renderReport } from "../report-renderer.js";
import { ReportRegistry, LocalReportStorage } from "@sentinel/compliance";
import { createElement } from "react";
import { Document, Page, Text } from "@react-pdf/renderer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("report-worker flow", () => {
  it("renders PDF and uploads to storage", async () => {
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

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-flow-"));
    const storage = new LocalReportStorage(tmpDir);

    // Render
    const result = await renderReport(
      registry,
      "test",
      { title: "Hello" },
      {
        orgName: "Test",
        accentColor: "#2563EB",
        footerText: "test",
      },
    );

    // Upload
    const storageKey = "reports/org1/test-report.pdf";
    await storage.upload(storageKey, result.buffer, "application/pdf");

    // Verify file exists
    const filePath = path.join(tmpDir, storageKey);
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = fs.readFileSync(filePath);
    expect(stored.slice(0, 5).toString()).toBe("%PDF-");
    expect(stored.length).toBe(result.fileSize);

    // Get download URL
    const url = await storage.getSignedUrl(storageKey, 900);
    expect(url).toBeTruthy();

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
