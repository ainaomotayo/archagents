import type { SchedulerJob, JobContext } from "../types.js";

export class AttestationExpiryJob implements SchedulerJob {
  name = "attestation-expiry" as const;
  schedule = "0 6 * * *";
  tier = "critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, eventBus, logger } = ctx;
    const now = new Date();
    const warningCutoff = new Date(now.getTime() + 14 * 86_400_000);

    // Find attestations expiring within 14 days
    const expiring = await db.controlAttestation.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: now, lte: warningCutoff },
      },
    });

    for (const att of expiring) {
      await eventBus.publish("sentinel.notifications", {
        id: `evt-${att.id}-expiring`,
        orgId: att.orgId,
        topic: "attestation.expiring",
        payload: {
          attestationId: att.id,
          controlCode: att.controlCode,
          frameworkSlug: att.frameworkSlug,
          expiresAt: att.expiresAt,
        },
        timestamp: now.toISOString(),
      });
    }

    // Find BAAs expiring within 30 days
    const baaCutoff = new Date(now.getTime() + 30 * 86_400_000);
    const expiringBaas = await db.businessAssociateAgreement.findMany({
      where: {
        status: "active",
        expiresAt: { gt: now, lte: baaCutoff },
      },
    });

    for (const baa of expiringBaas) {
      await eventBus.publish("sentinel.notifications", {
        id: `evt-baa-${baa.id}-expiring`,
        orgId: baa.orgId,
        topic: "baa.expiring",
        payload: {
          baaId: baa.id,
          vendorName: baa.vendorName,
          expiresAt: baa.expiresAt,
        },
        timestamp: now.toISOString(),
      });
    }

    logger.info(
      { expiring: expiring.length, expiringBaas: expiringBaas.length },
      "Attestation expiry sweep complete",
    );
  }
}
