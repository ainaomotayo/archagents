import * as fs from "node:fs";
import * as path from "node:path";
import type { SentinelFinding } from "./types.js";

export class FindingCache {
  findings: Map<string, SentinelFinding> = new Map();
  byFile: Map<string, Set<string>> = new Map();
  bySuffix: Map<string, Set<string>> = new Map();

  upsert(findings: SentinelFinding[]): void {
    for (const f of findings) {
      // If updating an existing finding, remove old index entries first
      const existing = this.findings.get(f.id);
      if (existing) {
        this.removeFromIndex(existing);
      }

      this.findings.set(f.id, f);
      this.addToIndex(f);
    }
  }

  remove(findingIds: string[]): void {
    for (const id of findingIds) {
      const finding = this.findings.get(id);
      if (finding) {
        this.removeFromIndex(finding);
        this.findings.delete(id);
      }
    }
  }

  getForFile(absolutePath: string, workspaceRoot: string): SentinelFinding[] {
    const relative = path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");

    // Try exact match first
    const ids = this.byFile.get(relative);
    if (ids && ids.size > 0) {
      return this.collectNonSuppressed(ids);
    }

    // Suffix fallback: get filename, look up candidate paths
    const filename = path.basename(absolutePath);
    const candidatePaths = this.bySuffix.get(filename);
    if (!candidatePaths) return [];

    const normalizedAbsolute = absolutePath.split(path.sep).join("/");
    const matched: SentinelFinding[] = [];

    for (const candidatePath of candidatePaths) {
      if (normalizedAbsolute.endsWith(candidatePath)) {
        const fileIds = this.byFile.get(candidatePath);
        if (fileIds) {
          matched.push(...this.collectNonSuppressed(fileIds));
        }
      }
    }

    return matched;
  }

  getAll(): SentinelFinding[] {
    return Array.from(this.findings.values());
  }

  clear(): void {
    this.findings.clear();
    this.byFile.clear();
    this.bySuffix.clear();
  }

  save(cacheDir: string, projectId: string): void {
    const dir = path.join(cacheDir, projectId);
    fs.mkdirSync(dir, { recursive: true });

    const data = JSON.stringify(Array.from(this.findings.values()));
    const targetPath = path.join(dir, "findings.json");
    const tmpPath = path.join(dir, `findings.${process.pid}.tmp`);

    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, targetPath);
  }

  load(cacheDir: string, projectId: string): void {
    const filePath = path.join(cacheDir, projectId, "findings.json");
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const findings: SentinelFinding[] = JSON.parse(data);
      this.clear();
      this.upsert(findings);
    } catch {
      // Ignore missing or corrupted files
    }
  }

  private addToIndex(f: SentinelFinding): void {
    const filePath = f.file;

    if (!this.byFile.has(filePath)) {
      this.byFile.set(filePath, new Set());
    }
    this.byFile.get(filePath)!.add(f.id);

    const filename = path.basename(filePath);
    if (!this.bySuffix.has(filename)) {
      this.bySuffix.set(filename, new Set());
    }
    this.bySuffix.get(filename)!.add(filePath);
  }

  private removeFromIndex(f: SentinelFinding): void {
    const filePath = f.file;

    const fileIds = this.byFile.get(filePath);
    if (fileIds) {
      fileIds.delete(f.id);
      if (fileIds.size === 0) {
        this.byFile.delete(filePath);

        const filename = path.basename(filePath);
        const suffixPaths = this.bySuffix.get(filename);
        if (suffixPaths) {
          suffixPaths.delete(filePath);
          if (suffixPaths.size === 0) {
            this.bySuffix.delete(filename);
          }
        }
      }
    }
  }

  private collectNonSuppressed(ids: Set<string>): SentinelFinding[] {
    const results: SentinelFinding[] = [];
    for (const id of ids) {
      const f = this.findings.get(id);
      if (f && !f.suppressed) {
        results.push(f);
      }
    }
    return results;
  }
}
