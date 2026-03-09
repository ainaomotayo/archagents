import { describe, it, expect } from "vitest";
import { isProtectedPath } from "../middleware";

describe("isProtectedPath", () => {
  it("marks /dashboard as protected", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/projects")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
  });

  it("does not protect /login or /api/auth paths", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/api/auth/callback")).toBe(false);
    expect(isProtectedPath("/api/auth/session")).toBe(false);
  });

  it("does not protect public marketing pages", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/pricing")).toBe(false);
    expect(isProtectedPath("/about")).toBe(false);
  });

  it("does not protect paths that merely contain 'dashboard' elsewhere", () => {
    expect(isProtectedPath("/api/dashboard-data")).toBe(false);
    expect(isProtectedPath("/docs/dashboard-guide")).toBe(false);
  });
});
