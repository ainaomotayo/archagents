import { LocalReportStorage, S3ReportStorage, type ReportStorage } from "@sentinel/compliance";
import path from "node:path";

export function createReportStorage(): ReportStorage {
  const mode = process.env.REPORT_STORAGE ?? "local";

  if (mode === "s3") {
    return new S3ReportStorage({
      bucket: process.env.REPORT_S3_BUCKET ?? "sentinel-reports",
      region: process.env.REPORT_S3_REGION ?? "us-east-1",
    });
  }

  const dataDir = process.env.REPORT_LOCAL_DIR ?? path.join(process.cwd(), "data", "reports");
  return new LocalReportStorage(dataDir);
}
