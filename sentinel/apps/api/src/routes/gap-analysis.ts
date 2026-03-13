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

  async function exportGaps(orgId: string, frameworkSlug: string, format: "json" | "csv" = "json") {
    const analysis = await computeGaps(orgId, frameworkSlug);
    if (format === "csv") {
      const header = "controlCode,controlName,severity,gapType,currentScore,requirementType,regulatoryStatus\n";
      const rows = analysis.gaps.map((g: any) =>
        [g.controlCode, `"${g.controlName}"`, g.severity, g.gapType, g.currentScore, g.requirementType ?? "", g.regulatoryStatus ?? ""].join(","),
      );
      return { contentType: "text/csv", data: header + rows.join("\n") };
    }
    return { contentType: "application/json", data: analysis };
  }

  async function getDashboard(orgId: string) {
    const results: Record<string, any> = {};
    for (const [slug, framework] of FRAMEWORK_MAP) {
      try {
        results[slug] = await computeGaps(orgId, slug);
      } catch {
        // Framework may have no data yet — skip
      }
    }

    const frameworks = Object.entries(results).map(([slug, analysis]: [string, any]) => ({
      slug,
      name: FRAMEWORK_MAP.get(slug)?.name ?? slug,
      overallScore: analysis.overallScore,
      gapCount: analysis.gaps.length,
      summary: analysis.summary,
    }));

    const totalGaps = frameworks.reduce((sum, f) => sum + f.gapCount, 0);
    const avgScore = frameworks.length > 0
      ? frameworks.reduce((sum, f) => sum + f.overallScore, 0) / frameworks.length
      : 0;

    return { frameworks, totalGaps, averageScore: avgScore, frameworkCount: frameworks.length };
  }

  return { computeGaps, exportGaps, getDashboard };
}
