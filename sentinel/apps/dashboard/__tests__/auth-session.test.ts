import { describe, it, expect, vi, beforeEach } from "vitest";
import { createServerSession, validateServerSession } from "../lib/auth-session";

describe("auth-session client", () => {
  beforeEach(() => {
    vi.stubEnv("SENTINEL_API_URL", "http://localhost:8080");
  });

  describe("createServerSession", () => {
    it("returns sessionId on success", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: "sess-123", evicted: false }),
      });
      const result = await createServerSession(
        { userId: "user-1", orgId: "org-1", provider: "github" },
        fetchFn,
      );
      expect(result).toBe("sess-123");
      expect(fetchFn).toHaveBeenCalledWith(
        "http://localhost:8080/v1/auth/sessions",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns null on API error (fail-open)", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await createServerSession(
        { userId: "user-1", orgId: "org-1", provider: "github" },
        fetchFn,
      );
      expect(result).toBeNull();
    });

    it("returns null on network error (fail-open)", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const result = await createServerSession(
        { userId: "user-1", orgId: "org-1", provider: "github" },
        fetchFn,
      );
      expect(result).toBeNull();
    });
  });

  describe("validateServerSession", () => {
    it("returns valid on success", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true }),
      });
      const result = await validateServerSession("sess-123", fetchFn);
      expect(result.valid).toBe(true);
    });

    it("returns invalid with reason", async () => {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ valid: false, reason: "idle_timeout" }),
      });
      const result = await validateServerSession("sess-123", fetchFn);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("idle_timeout");
    });

    it("returns valid on API error (fail-open)", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const result = await validateServerSession("sess-123", fetchFn);
      expect(result.valid).toBe(true);
    });

    it("returns valid on network error (fail-open)", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("timeout"));
      const result = await validateServerSession("sess-123", fetchFn);
      expect(result.valid).toBe(true);
    });
  });
});
