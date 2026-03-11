import { describe, it, expect } from "vitest";
import { rotateOrgKeys } from "../routes/encryption-admin.js";

describe("Key Rotation", () => {
  it("re-wraps all DEKs for an org", async () => {
    const rewrapCalls: string[] = [];
    const mockKms = {
      rewrapDataKey: async (kekId: string, _wrapped: Buffer) => {
        rewrapCalls.push(kekId);
        return Buffer.from("rewrapped");
      },
    };
    const keys = [
      { id: "k1", purpose: "data", wrappedDek: "b2xkMQ==", kekId: "kek-1", version: 1 },
      { id: "k2", purpose: "webhook", wrappedDek: "b2xkMg==", kekId: "kek-1", version: 1 },
    ];

    const results = await rotateOrgKeys(keys as any, mockKms as any, "kek-1");
    expect(results).toHaveLength(2);
    expect(rewrapCalls).toEqual(["kek-1", "kek-1"]);
    expect(results[0].newVersion).toBe(2);
    expect(results[1].newVersion).toBe(2);
  });
});
