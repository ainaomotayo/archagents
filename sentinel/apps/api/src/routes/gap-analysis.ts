import { computeGapAnalysis, FRAMEWORK_MAP } from "@sentinel/compliance";

interface GapAnalysisRouteDeps {
  db: any;
}

export function buildGapAnalysisRoutes(deps: GapAnalysisRouteDeps) {
  const { db } = deps;

  async function computeGaps(orgId: string, frameworkSlug: string) {
    const framework = FRAMEWORK_MAP.get(frameworkSlug);
    if (!framework) throw new Error(`Unknown framework: ${frameworkSlug}`);

    // Get findings for this org
    const findings = await db.finding.findMany({
      where: { scan: { orgId } },
      orderBy: { createdAt: "desc" },
    });

    // Get active attestations
    const attestationsRaw = await db.controlAttestation.findMany({
      where: { orgId, frameworkSlug, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    const attestations: Record<string, any> = {};
    for (const a of attestationsRaw) {
      attestations[a.controlCode] = a;
    }

    // Get remediations
    const remediationsRaw = await db.remediationItem.findMany({
      where: { orgId, frameworkSlug },
    });
    const remediations: Record<string, any> = {};
    for (const r of remediationsRaw) {
      remediations[r.controlCode] = r;
    }

    return computeGapAnalysis(framework, findings, attestations, remediations);
  }

  return { computeGaps };
}
