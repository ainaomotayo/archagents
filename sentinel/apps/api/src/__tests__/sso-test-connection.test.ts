import { describe, test, expect, vi } from "vitest";

vi.mock("@sentinel/db", () => ({
  getDb: () => ({}),
}));

import { testConnectionHandler } from "../routes/sso-config.js";

describe("testConnectionHandler", () => {
  test("returns error for config without providerType", async () => {
    const result = await testConnectionHandler({ clientId: "abc", clientSecret: "secret" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("providerType");
  });

  test("returns error for unknown provider type", async () => {
    const result = await testConnectionHandler({ providerType: "unknown", clientId: "abc", clientSecret: "secret" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not supported");
  });
});
