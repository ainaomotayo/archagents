import type { DiffHunk } from "./types.js";

export interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

export function parseDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  const fileSections = raw.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const pathMatch = section.match(/^a\/(.+?) b\/(.+)/m);
    if (!pathMatch) continue;

    const path = pathMatch[2];
    const hunks: DiffHunk[] = [];
    const hunkRegex = /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/g;

    let match;
    while ((match = hunkRegex.exec(section)) !== null) {
      const oldStart = parseInt(match[1], 10);
      const oldCount = parseInt(match[2] || "1", 10);
      const newStart = parseInt(match[3], 10);
      const newCount = parseInt(match[4] || "1", 10);

      const startIdx = match.index + match[0].length;
      const nextHunk = section.indexOf("\n@@", startIdx);
      const content = section.slice(
        startIdx,
        nextHunk === -1 ? undefined : nextHunk,
      );

      hunks.push({ oldStart, oldCount, newStart, newCount, content });
    }

    files.push({ path, hunks });
  }

  return files;
}
