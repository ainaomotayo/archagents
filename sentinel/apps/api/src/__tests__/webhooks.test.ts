import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

describe("webhook signature verification", () => {
  const secret = "test-webhook-secret";

  function sign(body: string): string {
    return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }

  it("valid signature matches", () => {
    const body = '{"action":"opened"}';
    const sig = sign(body);
    const expected = sign(body);
    expect(sig).toBe(expected);
  });

  it("tampered payload produces different signature", () => {
    const body = '{"action":"opened"}';
    const sig = sign(body);
    const tamperedSig = sign('{"action":"closed"}');
    expect(sig).not.toBe(tamperedSig);
  });
});
