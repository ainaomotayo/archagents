import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalReportStorage } from "../reports/storage.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("LocalReportStorage", () => {
  let storage: LocalReportStorage;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-test-"));
    storage = new LocalReportStorage(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uploads and reads back a file", async () => {
    const buf = Buffer.from("%PDF-1.4 test content");
    await storage.upload("org1/report1.pdf", buf, "application/pdf");
    const filePath = path.join(tmpDir, "org1/report1.pdf");
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath)).toEqual(buf);
  });

  it("getSignedUrl returns a file:// URL", async () => {
    const buf = Buffer.from("test");
    await storage.upload("key.pdf", buf, "application/pdf");
    const url = await storage.getSignedUrl("key.pdf", 900);
    expect(url).toContain("key.pdf");
  });

  it("delete removes the file", async () => {
    const buf = Buffer.from("test");
    await storage.upload("del.pdf", buf, "application/pdf");
    await storage.delete("del.pdf");
    expect(fs.existsSync(path.join(tmpDir, "del.pdf"))).toBe(false);
  });
});
