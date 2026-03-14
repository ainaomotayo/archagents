// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { AttributionTable } from "../components/attribution-table";

describe("AttributionTable", () => {
  it("exports a function component", () => {
    expect(typeof AttributionTable).toBe("function");
  });
});
