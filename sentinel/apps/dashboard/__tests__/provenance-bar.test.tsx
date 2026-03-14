// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ProvenanceBar } from "../components/provenance-bar";

describe("ProvenanceBar", () => {
  it("exports a function component", () => {
    expect(typeof ProvenanceBar).toBe("function");
  });

  it("returns null for zero-file classifications", () => {
    const result = ProvenanceBar({
      classifications: {
        human: { files: 0, loc: 0, percentage: 0 },
        aiGenerated: { files: 0, loc: 0, percentage: 0 },
        aiAssisted: { files: 0, loc: 0, percentage: 0 },
        mixed: { files: 0, loc: 0, percentage: 0 },
        unknown: { files: 0, loc: 0, percentage: 0 },
      },
    });
    expect(result).toBeNull();
  });
});
