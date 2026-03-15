import { describe, it, expect } from "vitest";
import { computeEvidenceHash, verifyEvidenceChain } from "../evidence/chain.js";

describe("computeEvidenceHash", () => {
  it("computes deterministic hash for same data + prevHash", () => {
    const data = { event: "scan_completed", scanId: "s1" };
    const hash1 = computeEvidenceHash(data, null);
    const hash2 = computeEvidenceHash(data, null);
    expect(hash1).toBe(hash2);
  });

  it("genesis record uses GENESIS as prevHash", () => {
    const data = { event: "scan_completed" };
    const hash = computeEvidenceHash(data, null);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
  });

  it("different data produces different hashes", () => {
    const hash1 = computeEvidenceHash({ a: 1 }, null);
    const hash2 = computeEvidenceHash({ a: 2 }, null);
    expect(hash1).not.toBe(hash2);
  });

  it("different prevHash produces different hashes", () => {
    const data = { a: 1 };
    const hash1 = computeEvidenceHash(data, "abc");
    const hash2 = computeEvidenceHash(data, "def");
    expect(hash1).not.toBe(hash2);
  });
});

describe("verifyEvidenceChain", () => {
  it("verifies a valid 3-record chain", () => {
    const d1 = { event: "first" };
    const h1 = computeEvidenceHash(d1, null);
    const d2 = { event: "second" };
    const h2 = computeEvidenceHash(d2, h1);
    const d3 = { event: "third" };
    const h3 = computeEvidenceHash(d3, h2);

    const chain = [
      { data: d1, hash: h1, prevHash: null },
      { data: d2, hash: h2, prevHash: h1 },
      { data: d3, hash: h3, prevHash: h2 },
    ];

    const result = verifyEvidenceChain(chain);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeNull();
  });

  it("detects tampered data", () => {
    const d1 = { event: "first" };
    const h1 = computeEvidenceHash(d1, null);
    const d2 = { event: "second" };
    const h2 = computeEvidenceHash(d2, h1);

    const chain = [
      { data: d1, hash: h1, prevHash: null },
      { data: { event: "TAMPERED" }, hash: h2, prevHash: h1 },
    ];

    const result = verifyEvidenceChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("detects broken prevHash link", () => {
    const d1 = { event: "first" };
    const h1 = computeEvidenceHash(d1, null);
    const d2 = { event: "second" };
    const h2 = computeEvidenceHash(d2, "wrong-prev-hash");

    const chain = [
      { data: d1, hash: h1, prevHash: null },
      { data: d2, hash: h2, prevHash: h1 },
    ];

    const result = verifyEvidenceChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
  });

  it("returns valid for empty chain", () => {
    const result = verifyEvidenceChain([]);
    expect(result.valid).toBe(true);
  });
});
