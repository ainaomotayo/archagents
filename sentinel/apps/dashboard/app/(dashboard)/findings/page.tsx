import Link from "next/link";
import { getFindings } from "@/lib/api";
import { FindingCard } from "@/components/finding-card";
import { PageHeader } from "@/components/page-header";

export default async function FindingsPage() {
  const findings = await getFindings();

  const openCount = findings.filter((f) => f.status === "open").length;
  const criticalCount = findings.filter((f) => f.severity === "critical").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Findings"
        description={`${openCount} open findings across all monitored projects${criticalCount > 0 ? ` \u00B7 ${criticalCount} critical` : ""}`}
      />

      <div className="grid gap-3">
        {findings.map((finding, i) => (
          <Link
            key={finding.id}
            href={`/dashboard/findings/${finding.id}`}
            className="animate-fade-up block focus-ring rounded-lg"
            style={{ animationDelay: `${0.05 * i}s` }}
            aria-label={`View finding: ${finding.title}`}
          >
            <FindingCard finding={finding} />
          </Link>
        ))}
      </div>
    </div>
  );
}
