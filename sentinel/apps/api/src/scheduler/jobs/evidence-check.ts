import { verifyEvidenceChain } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class EvidenceCheckJob implements SchedulerJob {
  name = "evidence-check" as const;
  schedule = "30 5 * * *";
  tier = "critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    let checked = 0;
    let failures = 0;

    for (const org of orgs) {
      const records = await ctx.db.evidenceRecord.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: "asc" },
      });
      if (records.length === 0) continue;

      const chain = records.map((r: any) => ({
        data: r.data,
        hash: r.hash,
        prevHash: r.prevHash,
      }));
      const result = verifyEvidenceChain(chain);
      checked++;
      if (!result.valid) {
        failures++;
        ctx.logger.error(
          { orgId: org.id, brokenAt: result.brokenAt },
          "Evidence chain integrity failure",
        );
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-${org.id}-chain-broken`,
          orgId: org.id,
          topic: "evidence.chain_broken",
          payload: { orgId: org.id, brokenAtIndex: result.brokenAt },
          timestamp: new Date().toISOString(),
        });
      }
    }
    ctx.logger.info(
      { checked, failures },
      "Evidence chain integrity check completed",
    );
  }
}
