import { describe, it, expect } from "vitest";
import { parseDiff } from "../diff-parser.js";

describe("parseDiff", () => {
  it("returns empty array for empty input", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("  \n  ")).toEqual([]);
  });

  it("parses a single-file diff", () => {
    const raw = [
      "diff --git a/src/main.ts b/src/main.ts",
      "index abc1234..def5678 100644",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
      "@@ -1,3 +1,4 @@",
      " import { foo } from './foo';",
      "+import { bar } from './bar';",
      " ",
      " console.log(foo);",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/main.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].newStart).toBe(1);
    expect(files[0].hunks[0].newCount).toBe(4);
  });

  it("parses multi-file diff", () => {
    const raw = [
      "diff --git a/a.ts b/a.ts",
      "@@ -1,1 +1,2 @@",
      " line1",
      "+line2",
      "diff --git a/b.ts b/b.ts",
      "@@ -0,0 +1,3 @@",
      "+new file line1",
      "+new file line2",
      "+new file line3",
    ].join("\n");

    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("a.ts");
    expect(files[1].path).toBe("b.ts");
  });
});
