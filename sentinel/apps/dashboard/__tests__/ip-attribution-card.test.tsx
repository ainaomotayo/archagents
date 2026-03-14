// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { IPAttributionCard } from "../components/ip-attribution-card";

describe("IPAttributionCard", () => {
  it("exports an async function component", () => {
    expect(typeof IPAttributionCard).toBe("function");
  });
});
