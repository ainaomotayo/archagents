import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getComplianceScores, getComplianceTrends, getActiveAttestations } from "@/lib/api";
import { GapAnalysisClient } from "@/components/compliance/GapAnalysisClient";
import { RefreshButton } from "@/components/compliance/RefreshButton";
import { ScheduledReportsWidget } from "@/components/compliance/ScheduledReportsWidget";
import { EmptyState } from "@/components/empty-state";
import { IconClipboardCheck } from "@/components/icons";

export default async function GapAnalysisPage() {
  const [frameworks, attestationOverrides] = await Promise.all([
    getComplianceScores(),
    getActiveAttestations(),
  ]);

  if (frameworks.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Gap Analysis"
          description="Visual overview of compliance control coverage across frameworks"
          action={<RefreshButton />}
        />
        <EmptyState
          icon={IconClipboardCheck}
          headline="Compliance posture requires scan data"
          body="Run at least one scan to see your compliance posture across configured frameworks."
          cta={{ label: "Add a project", href: "/settings/vcs" }}
        />
      </div>
    );
  }

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

      <ScheduledReportsWidget />

      <GapAnalysisClient frameworks={frameworks} trendData={trendData} attestationOverrides={attestationOverrides} />
    </div>
  );
}
