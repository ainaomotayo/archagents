import { describe, it, expect } from "vitest";
import { parseDiff } from "./diff.js";

describe("parseDiff", () => {
  it("parses a unified diff into structured hunks", () => {
    const raw = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +10,5 @@
+import { foo } from "bar";
+
 export function main() {
-  console.log("hello");
+  console.log("world");
 }
`;

    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].newStart).toBe(10);
    expect(files[0].hunks[0].newCount).toBe(5);
  });

  it("parses multiple files", () => {
    const raw = `diff --git a/file1.ts b/file1.ts
index abc..def 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
+added line
 existing
 existing
diff --git a/file2.ts b/file2.ts
index abc..def 100644
--- a/file2.ts
+++ b/file2.ts
@@ -5,4 +5,6 @@
 context
+new line 1
+new line 2
 context
`;

    const files = parseDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("file1.ts");
    expect(files[1].path).toBe("file2.ts");
  });

  it("returns empty array for empty diff", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("   ")).toEqual([]);
  });
});
