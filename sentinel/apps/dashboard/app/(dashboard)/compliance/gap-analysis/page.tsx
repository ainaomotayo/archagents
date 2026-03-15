import { PageHeader } from "@/components/page-header";
import { getComplianceScores, getComplianceTrends } from "@/lib/api";
import { GapAnalysisClient } from "@/components/compliance/GapAnalysisClient";
import { RefreshButton } from "@/components/compliance/RefreshButton";

export default async function GapAnalysisPage() {
  const frameworks = await getComplianceScores();

  // Pre-fetch trends for all frameworks in parallel
  const trendEntries = await Promise.all(
    frameworks.map(async (fw) => {
      const trends = await getComplianceTrends(fw.frameworkSlug);
      return [fw.frameworkSlug, trends] as const;
    }),
  );
  const trendData = Object.fromEntries(trendEntries);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gap Analysis"
        description="Visual overview of compliance control coverage across frameworks"
        action={<RefreshButton />}
      />

      <GapAnalysisClient frameworks={frameworks} trendData={trendData} />
    </div>
  );
}
