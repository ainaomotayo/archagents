import { describe, it, expect, vi } from "vitest";
import { resolveApiKeyAuth } from "../middleware/auth.js";

describe("API Key Auth Resolution", () => {
  it("returns null when no Bearer header", async () => {
    const result = await resolveApiKeyAuth(undefined, vi.fn());
    expect(result).toBeNull();
  });

  it("returns null for non-sk_ prefix", async () => {
    const result = await resolveApiKeyAuth("Bearer abc123", vi.fn());
    expect(result).toBeNull();
  });

  it("calls lookup function with key prefix", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    await resolveApiKeyAuth("Bearer sk_abc12345rest", lookup);
    expect(lookup).toHaveBeenCalledWith("sk_abc12");
  });
});
