import { readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";

export const HOOK_MARKER = "# SENTINEL_HOOK_START";
export const HOOK_MARKER_END = "# SENTINEL_HOOK_END";

export const HOOK_CONTENT = `
${HOOK_MARKER}
# SENTINEL post-commit hook — scans AI-generated code
sentinel scan --post-commit 2>/dev/null &
${HOOK_MARKER_END}
`;

export async function installHook(repoRoot: string): Promise<void> {
  const hookPath = join(repoRoot, ".git", "hooks", "post-commit");

  let existing = "";
  try {
    existing = await readFile(hookPath, "utf-8");
  } catch {
    existing = "#!/bin/sh\n";
  }

  // If already installed, replace with latest version
  if (existing.includes(HOOK_MARKER)) {
    const before = existing.slice(0, existing.indexOf(HOOK_MARKER));
    const after = existing.slice(
      existing.indexOf(HOOK_MARKER_END) + HOOK_MARKER_END.length,
    );
    existing = before + after;
  }

  const content = existing.trimEnd() + "\n" + HOOK_CONTENT;
  await writeFile(hookPath, content);
  await chmod(hookPath, 0o755);
}
