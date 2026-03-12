import { describe, test, expect, vi } from "vitest";
import { AttestationExpiryJob } from "../jobs/attestation-expiry.js";
import type { JobContext } from "../types.js";

function createMockContext(overrides?: Partial<Record<string, any>>): JobContext {
  return {
    eventBus: { publish: vi.fn(async () => "msg-1") } as any,
    db: {
      controlAttestation: {
        findMany: overrides?.attestationFindMany ?? vi.fn(async () => []),
      },
      businessAssociateAgreement: {
        findMany: overrides?.baaFindMany ?? vi.fn(async () => []),
      },
    } as any,
    redis: {} as any,
    metrics: { recordTrigger: vi.fn(), recordError: vi.fn() } as any,
    audit: { log: vi.fn(async () => {}) } as any,
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as any,
  };
}

describe("AttestationExpiryJob", () => {
  test("has correct metadata", () => {
    const job = new AttestationExpiryJob();
    expect(job.name).toBe("attestation-expiry");
    expect(job.schedule).toBe("0 6 * * *");
    expect(job.tier).toBe("critical");
    expect(job.dependencies).toContain("postgres");
  });

  test("detects expiring attestations and publishes notifications", async () => {
    const job = new AttestationExpiryJob();
    const attestationFindMany = vi.fn(async () => [
      { id: "att-1", controlCode: "AS-1.1", orgId: "org-1", frameworkSlug: "soc2", expiresAt: new Date() },
    ]);
    const baaFindMany = vi.fn(async () => []);
    const ctx = createMockContext({ attestationFindMany, baaFindMany });

    await job.execute(ctx);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "attestation.expiring",
        orgId: "org-1",
      }),
    );
  });

  test("detects expiring BAAs and publishes notifications", async () => {
    const job = new AttestationExpiryJob();
    const attestationFindMany = vi.fn(async () => []);
    const baaFindMany = vi.fn(async () => [
      { id: "baa-1", orgId: "org-1", vendorName: "Acme Corp", expiresAt: new Date() },
    ]);
    const ctx = createMockContext({ attestationFindMany, baaFindMany });

    await job.execute(ctx);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      "sentinel.notifications",
      expect.objectContaining({
        topic: "baa.expiring",
        orgId: "org-1",
      }),
    );
  });

  test("handles no expiring items gracefully", async () => {
    const job = new AttestationExpiryJob();
    const ctx = createMockContext();

    await job.execute(ctx);

    expect(ctx.eventBus.publish).not.toHaveBeenCalled();
    expect(ctx.logger.info).toHaveBeenCalledWith(
      { expiring: 0, expiringBaas: 0 },
      "Attestation expiry sweep complete",
    );
  });
});
