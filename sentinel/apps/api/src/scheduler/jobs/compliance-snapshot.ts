import { BUILT_IN_FRAMEWORKS, scoreFramework, type FindingInput } from "@sentinel/compliance";
import type { SchedulerJob, JobContext } from "../types.js";

export class ComplianceSnapshotJob implements SchedulerJob {
  name = "compliance-snapshot" as const;
  schedule = "0 5 * * *";
  tier = "critical" as const;
  dependencies = ["redis", "postgres"] as const;

  async execute(ctx: JobContext): Promise<void> {
    const orgs = await ctx.db.organization.findMany({ select: { id: true } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let generated = 0;

    for (const org of orgs) {
      const findings = await ctx.db.finding.findMany({
        where: { orgId: org.id, suppressed: false },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const inputs: FindingInput[] = findings.map((f: any) => ({
        id: f.id,
        agentName: f.agentName,
        severity: f.severity,
        category: f.category,
        suppressed: f.suppressed,
      }));

      // Fetch active attestations for attestation-aware scoring
      const attestationsRaw = await ctx.db.controlAttestation.findMany({
        where: { orgId: org.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });

      for (const fw of BUILT_IN_FRAMEWORKS) {
        const fwAttestations: Record<string, any> = {};
        for (const a of attestationsRaw) {
          if (a.frameworkSlug === fw.slug) fwAttestations[a.controlCode] = a;
        }
        const result = scoreFramework(fw.controls, inputs, fwAttestations);
        await ctx.db.complianceSnapshot.upsert({
          where: {
            orgId_frameworkId_date: {
              orgId: org.id,
              frameworkId: fw.slug,
              date: today,
            },
          },
          update: {
            score: result.score,
            controlBreakdown: result.controlScores,
          },
          create: {
            orgId: org.id,
            frameworkId: fw.slug,
            date: today,
            score: result.score,
            controlBreakdown: result.controlScores,
          },
        });
        await ctx.db.complianceAssessment.create({
          data: {
            orgId: org.id,
            frameworkId: fw.slug,
            score: result.score,
            verdict: result.verdict,
            controlScores: result.controlScores,
          },
        });
        await ctx.eventBus.publish("sentinel.notifications", {
          id: `evt-${org.id}-${fw.slug}-assessed`,
          orgId: org.id,
          topic: "compliance.assessed",
          payload: {
            frameworkSlug: fw.slug,
            score: result.score,
            verdict: result.verdict,
          },
          timestamp: new Date().toISOString(),
        });
        const prevSnapshot = await ctx.db.complianceSnapshot.findFirst({
          where: {
            orgId: org.id,
            frameworkId: fw.slug,
            date: { lt: today },
          },
          orderBy: { date: "desc" },
        });
        if (prevSnapshot && result.score < prevSnapshot.score) {
          await ctx.eventBus.publish("sentinel.notifications", {
            id: `evt-${org.id}-${fw.slug}-degraded`,
            orgId: org.id,
            topic: "compliance.degraded",
            payload: {
              frameworkSlug: fw.slug,
              previousScore: prevSnapshot.score,
              newScore: result.score,
            },
            timestamp: new Date().toISOString(),
          });
        }
        generated++;
      }
    }
    ctx.logger.info({ generated }, "Compliance snapshots generated");
  }
}
