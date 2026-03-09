import { describe, it, expect } from "vitest";
import { isProtectedPath } from "../middleware";

describe("isProtectedPath", () => {
  it("marks dashboard routes as protected", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/projects")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/findings")).toBe(true);
  });

  it("does not protect /login or /api/auth paths", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/api/auth/callback")).toBe(false);
    expect(isProtectedPath("/api/auth/session")).toBe(false);
  });

  it("does not protect public marketing pages", () => {
    expect(isProtectedPath("/welcome")).toBe(false);
    expect(isProtectedPath("/welcome/pricing")).toBe(false);
    expect(isProtectedPath("/pricing")).toBe(false);
  });
});
