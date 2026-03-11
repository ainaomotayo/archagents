import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FindingCache } from "../finding-cache.js";
import type { SentinelFinding } from "../types.js";

function makeFinding(overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: "f-1",
    scanId: "scan-1",
    orgId: "org-1",
    agentName: "security",
    type: "vulnerability",
    severity: "high",
    category: null,
    file: "src/index.ts",
    lineStart: 10,
    lineEnd: 12,
    title: "SQL Injection",
    description: "Possible SQL injection",
    remediation: "Use parameterized queries",
    cweId: "CWE-89",
    confidence: 0.95,
    suppressed: false,
    createdAt: "2026-03-10T00:00:00Z",
    ...overrides,
  };
}

describe("FindingCache", () => {
  it("upsert and getForFile returns findings by exact relative path", () => {
    const cache = new FindingCache();
    const finding = makeFinding({ id: "f-1", file: "src/index.ts" });
    cache.upsert([finding]);

    const results = cache.getForFile("/workspace/src/index.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-1");
  });

  it("getForFile returns empty for unknown file", () => {
    const cache = new FindingCache();
    cache.upsert([makeFinding({ id: "f-1", file: "src/index.ts" })]);

    const results = cache.getForFile("/workspace/src/other.ts", "/workspace");
    expect(results).toHaveLength(0);
  });

  it("suffix fallback matches monorepo sub-paths", () => {
    const cache = new FindingCache();
    const finding = makeFinding({
      id: "f-1",
      file: "users/controller.ts",
    });
    cache.upsert([finding]);

    const results = cache.getForFile(
      "/workspace/packages/api/users/controller.ts",
      "/workspace",
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-1");
  });

  it("remove deletes findings and updates index", () => {
    const cache = new FindingCache();
    cache.upsert([
      makeFinding({ id: "f-1", file: "src/a.ts" }),
      makeFinding({ id: "f-2", file: "src/a.ts" }),
    ]);

    cache.remove(["f-1"]);

    const results = cache.getForFile("/workspace/src/a.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-2");
    expect(cache.getAll()).toHaveLength(1);
  });

  it("upsert updates existing finding by id", () => {
    const cache = new FindingCache();
    cache.upsert([makeFinding({ id: "f-1", file: "src/index.ts", title: "Old Title" })]);
    cache.upsert([makeFinding({ id: "f-1", file: "src/index.ts", title: "New Title" })]);

    const results = cache.getForFile("/workspace/src/index.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("New Title");
  });

  it("excludes suppressed findings from getForFile", () => {
    const cache = new FindingCache();
    cache.upsert([
      makeFinding({ id: "f-1", file: "src/index.ts", suppressed: false }),
      makeFinding({ id: "f-2", file: "src/index.ts", suppressed: true }),
    ]);

    const results = cache.getForFile("/workspace/src/index.ts", "/workspace");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("f-1");
  });

  it("clear removes all findings", () => {
    const cache = new FindingCache();
    cache.upsert([
      makeFinding({ id: "f-1", file: "src/a.ts" }),
      makeFinding({ id: "f-2", file: "src/b.ts" }),
    ]);

    cache.clear();

    expect(cache.getAll()).toHaveLength(0);
    expect(cache.getForFile("/workspace/src/a.ts", "/workspace")).toHaveLength(0);
  });

  describe("save and load", () => {
    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("persists to disk and loads back", () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sentinel-cache-"));
      const projectId = "proj-123";

      const cache = new FindingCache();
      cache.upsert([
        makeFinding({ id: "f-1", file: "src/a.ts" }),
        makeFinding({ id: "f-2", file: "src/b.ts" }),
      ]);
      cache.save(tmpDir, projectId);

      const loaded = new FindingCache();
      loaded.load(tmpDir, projectId);

      expect(loaded.getAll()).toHaveLength(2);
      expect(loaded.getForFile("/workspace/src/a.ts", "/workspace")).toHaveLength(1);
      expect(loaded.getForFile("/workspace/src/b.ts", "/workspace")).toHaveLength(1);
    });
  });
});
