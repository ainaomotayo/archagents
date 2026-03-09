import { describe, it, expect } from "vitest";
import { buildArchiveKey, buildPutObjectParams, buildObjectLockConfig } from "./s3-archive.js";
import type { ArchiveConfig } from "./s3-archive.js";

describe("s3-archive", () => {
  it("should build archive key with correct format", () => {
    const key = buildArchiveKey("org-123", "evt-456");
    // Format: {orgId}/audit/{YYYY-MM}/{eventId}.json
    expect(key).toMatch(/^org-123\/audit\/\d{4}-\d{2}\/evt-456\.json$/);
  });

  it("should include current year-month in key", () => {
    const key = buildArchiveKey("org-1", "evt-1");
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    expect(key).toContain(`${yyyy}-${mm}`);
  });

  it("should build PutObject params with compliance lock", () => {
    const config: ArchiveConfig = {
      bucket: "sentinel-audit",
      prefix: "archives",
      retentionDays: 365,
    };
    const params = buildPutObjectParams(config, "org-1/audit/2026-03/evt-1.json", '{"event":"test"}') as Record<string, unknown>;

    expect(params.Bucket).toBe("sentinel-audit");
    expect(params.Key).toBe("archives/org-1/audit/2026-03/evt-1.json");
    expect(params.Body).toBe('{"event":"test"}');
    expect(params.ContentType).toBe("application/json");
    expect(params.ObjectLockMode).toBe("COMPLIANCE");
    expect(params.ObjectLockRetainUntilDate).toBeTruthy();
  });

  it("should set retention date in the future", () => {
    const config: ArchiveConfig = {
      bucket: "test-bucket",
      prefix: "pfx",
      retentionDays: 90,
    };
    const params = buildPutObjectParams(config, "key", "data") as Record<string, unknown>;
    const retainUntil = new Date(params.ObjectLockRetainUntilDate as string);
    const now = new Date();
    // Should be at least 89 days in the future
    const diffDays = (retainUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(88);
    expect(diffDays).toBeLessThan(92);
  });

  it("should build Object Lock configuration", () => {
    const config = buildObjectLockConfig(365) as Record<string, unknown>;
    expect(config.ObjectLockEnabled).toBe("Enabled");
    const rule = config.Rule as Record<string, unknown>;
    const retention = rule.DefaultRetention as Record<string, unknown>;
    expect(retention.Mode).toBe("COMPLIANCE");
    expect(retention.Days).toBe(365);
  });

  it("should build Object Lock configuration with custom days", () => {
    const config = buildObjectLockConfig(30) as Record<string, unknown>;
    const rule = config.Rule as Record<string, unknown>;
    const retention = rule.DefaultRetention as Record<string, unknown>;
    expect(retention.Days).toBe(30);
  });
});
