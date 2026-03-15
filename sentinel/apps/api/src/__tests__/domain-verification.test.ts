import { describe, it, expect } from "vitest";

describe("domain verification", () => {
  it("validates domain format", () => {
    const validDomain = /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    expect(validDomain.test("acme.com")).toBe(true);
    expect(validDomain.test("sub.acme.com")).toBe(true);
    expect(validDomain.test("-invalid.com")).toBe(false);
    expect(validDomain.test("no_tld")).toBe(false);
  });

  it("generates verification token format", () => {
    const { randomBytes } = require("node:crypto");
    const token = `sentinel-verify=${randomBytes(16).toString("hex")}`;
    expect(token).toMatch(/^sentinel-verify=[a-f0-9]{32}$/);
  });
});
