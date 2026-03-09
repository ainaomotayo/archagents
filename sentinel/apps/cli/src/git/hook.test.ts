import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installHook, HOOK_MARKER } from "./hook.js";

describe("installHook", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "sentinel-hook-test-"));
    await mkdir(join(tempDir, ".git", "hooks"), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs post-commit hook", async () => {
    await installHook(tempDir);

    const hookPath = join(tempDir, ".git", "hooks", "post-commit");
    const content = await readFile(hookPath, "utf-8");

    expect(content).toContain("sentinel");
    expect(content).toContain(HOOK_MARKER);

    const fileStat = await stat(hookPath);
    expect(fileStat.mode & 0o111).toBeTruthy();
  });

  it("preserves existing hook content", async () => {
    const hookPath = join(tempDir, ".git", "hooks", "post-commit");
    const existingContent = "#!/bin/sh\necho 'existing hook'\n";
    await writeFile(hookPath, existingContent);

    await installHook(tempDir);

    const content = await readFile(hookPath, "utf-8");
    expect(content).toContain("existing hook");
    expect(content).toContain(HOOK_MARKER);
  });
});
