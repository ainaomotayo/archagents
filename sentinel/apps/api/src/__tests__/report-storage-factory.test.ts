import { describe, it, expect, afterEach } from "vitest";
import { createReportStorage } from "../report-storage-factory.js";
import { LocalReportStorage, S3ReportStorage } from "@sentinel/compliance";

describe("createReportStorage", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns LocalReportStorage when REPORT_STORAGE=local", () => {
    process.env.REPORT_STORAGE = "local";
    const storage = createReportStorage();
    expect(storage).toBeInstanceOf(LocalReportStorage);
  });

  it("returns S3ReportStorage when REPORT_STORAGE=s3", () => {
    process.env.REPORT_STORAGE = "s3";
    process.env.REPORT_S3_BUCKET = "my-bucket";
    const storage = createReportStorage();
    expect(storage).toBeInstanceOf(S3ReportStorage);
  });

  it("defaults to local when REPORT_STORAGE is not set", () => {
    delete process.env.REPORT_STORAGE;
    const storage = createReportStorage();
    expect(storage).toBeInstanceOf(LocalReportStorage);
  });
});
