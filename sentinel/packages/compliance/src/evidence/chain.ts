import { createHash } from "node:crypto";

export function computeEvidenceHash(
  data: unknown,
  prevHash: string | null,
): string {
  const payload = JSON.stringify(data) + (prevHash ?? "GENESIS");
  return createHash("sha256").update(payload).digest("hex");
}

export interface ChainRecord {
  data: unknown;
  hash: string;
  prevHash: string | null;
}

export interface ChainVerification {
  valid: boolean;
  brokenAt: number | null;
  checkedCount: number;
}

export function verifyEvidenceChain(
  chain: ChainRecord[],
): ChainVerification {
  for (let i = 0; i < chain.length; i++) {
    const record = chain[i];
    const expectedPrev = i === 0 ? null : chain[i - 1].hash;

    if (record.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: i, checkedCount: i + 1 };
    }

    const recomputed = computeEvidenceHash(record.data, record.prevHash);
    if (recomputed !== record.hash) {
      return { valid: false, brokenAt: i, checkedCount: i + 1 };
    }
  }

  return { valid: true, brokenAt: null, checkedCount: chain.length };
}
