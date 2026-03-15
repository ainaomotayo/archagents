import { describe, test, expect, vi } from "vitest";
import { tryJitProvision } from "../lib/auth-jit.js";

describe("tryJitProvision", () => {
  test("calls JIT API and returns result on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ action: "created", userId: "user-1", role: "viewer" }),
    });
    const result = await tryJitProvision(
      { email: "alice@acme.com", name: "Alice", sub: "okta-123" },
      "okta", "org-1", mockFetch,
    );
    expect(result?.action).toBe("created");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/auth/jit-provision"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("returns null on network error (fail-open)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await tryJitProvision(
      { email: "alice@acme.com", name: "Alice", sub: "okta-123" },
      "okta", "org-1", mockFetch,
    );
    expect(result).toBeNull();
  });
});
