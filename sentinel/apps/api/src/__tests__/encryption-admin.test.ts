import { describe, it, expect, vi } from "vitest";
import { rotateOrgKeys } from "../routes/encryption-admin.js";
import { DekCache } from "@sentinel/security";

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

  it("returns incremented versions for keys at different version levels", async () => {
    const mockKms = {
      rewrapDataKey: async (_kekId: string, _wrapped: Buffer) => Buffer.from("new-wrapped"),
    };
    const keys = [
      { id: "k1", purpose: "data", wrappedDek: "YQ==", kekId: "kek-2", version: 3 },
      { id: "k2", purpose: "webhook", wrappedDek: "Yg==", kekId: "kek-2", version: 7 },
      { id: "k3", purpose: "audit", wrappedDek: "Yw==", kekId: "kek-2", version: 1 },
    ];

    const results = await rotateOrgKeys(keys as any, mockKms as any, "kek-2");
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ id: "k1", newWrapped: expect.any(String), newVersion: 4 });
    expect(results[1]).toEqual({ id: "k2", newWrapped: expect.any(String), newVersion: 8 });
    expect(results[2]).toEqual({ id: "k3", newWrapped: expect.any(String), newVersion: 2 });
  });

  it("crypto-shred should support cache eviction", () => {
    const cache = new DekCache();
    cache.set("org-1", "test", Buffer.alloc(32, 0xaa));
    expect(cache.size).toBe(1);
    cache.evict("org-1");
    expect(cache.size).toBe(0);
  });

  it("calls rewrapDataKey once per key with the correct kekId", async () => {
    const rewrapSpy = vi.fn(async (_kekId: string, _wrapped: Buffer) => Buffer.from("out"));
    const mockKms = { rewrapDataKey: rewrapSpy };
    const keys = [
      { id: "k1", purpose: "data", wrappedDek: "YQ==", kekId: "kek-1", version: 1 },
      { id: "k2", purpose: "webhook", wrappedDek: "Yg==", kekId: "kek-1", version: 2 },
      { id: "k3", purpose: "audit", wrappedDek: "Yw==", kekId: "kek-1", version: 5 },
    ];

    await rotateOrgKeys(keys as any, mockKms as any, "kek-1");
    expect(rewrapSpy).toHaveBeenCalledTimes(3);
    for (const call of rewrapSpy.mock.calls) {
      expect(call[0]).toBe("kek-1");
      expect(Buffer.isBuffer(call[1])).toBe(true);
    }
  });
});
