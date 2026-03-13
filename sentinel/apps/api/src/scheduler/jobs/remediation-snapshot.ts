import type { SchedulerJob, JobContext } from "../types.js";

export class RemediationSnapshotJob implements SchedulerJob {
  name = "remediation-snapshot" as const;
  schedule = "0 2 * * *"; // daily at 2am UTC
  tier = "non-critical" as const;
  dependencies = ["postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const { db, logger } = ctx;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const orgs = await db.organization.findMany({ select: { id: true } });

    for (const org of orgs) {
      const [openCount, inProgressCount, completedCount, acceptedRiskCount] =
        await Promise.all([
          db.remediationItem.count({
            where: { orgId: org.id, status: "open" },
          }),
          db.remediationItem.count({
            where: {
              orgId: org.id,
              status: {
                in: [
                  "assigned",
                  "in_progress",
                  "in_review",
                  "awaiting_deployment",
                ],
              },
            },
          }),
          db.remediationItem.count({
            where: { orgId: org.id, status: "completed" },
          }),
          db.remediationItem.count({
            where: { orgId: org.id, status: "accepted_risk" },
          }),
        ]);

      await db.remediationSnapshot.upsert({
        where: {
          orgId_snapshotDate_scope_scopeValue: {
            orgId: org.id,
            snapshotDate: today,
            scope: "org",
            scopeValue: null,
          },
        },
        create: {
          orgId: org.id,
          snapshotDate: today,
          scope: "org",
          openCount,
          inProgressCount,
          completedCount,
          acceptedRiskCount,
        },
        update: {
          openCount,
          inProgressCount,
          completedCount,
          acceptedRiskCount,
        },
      });
    }

    logger.info({ orgs: orgs.length }, "Remediation snapshots captured");
  }
}
