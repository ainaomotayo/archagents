import Link from "next/link";
import { getFindings } from "@/lib/api";
import { FindingCard } from "@/components/finding-card";
import { PageHeader } from "@/components/page-header";

export default async function FindingsPage() {
  const findings = await getFindings();

  const openCount = findings.filter((f) => f.status === "open").length;
  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  const severityCounts = {
    critical: criticalCount,
    high: highCount,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Findings"
        description={`${openCount} open findings across all monitored projects${criticalCount > 0 ? ` \u00B7 ${criticalCount} critical` : ""}`}
      />

      {/* Severity summary strip */}
      <div
        className="animate-fade-up flex gap-2"
        style={{ animationDelay: "0.03s" }}
      >
        {(
          [
            ["critical", "bg-severity-critical", "border-severity-critical/30"],
            ["high", "bg-severity-high", "border-severity-high/30"],
            ["medium", "bg-severity-medium", "border-severity-medium/30"],
            ["low", "bg-severity-low", "border-severity-low/30"],
          ] as const
        ).map(([sev, bg, border]) => (
          <div
            key={sev}
            className={`flex items-center gap-2 rounded-lg border ${border} bg-surface-1 px-3 py-2`}
          >
            <span className={`h-2 w-2 rounded-full ${bg}`} />
            <span className="text-[11px] font-semibold capitalize text-text-secondary">
              {sev}
            </span>
            <span className="font-mono text-[13px] font-bold text-text-primary">
              {severityCounts[sev]}
            </span>
          </div>
        ))}
      </div>

      {/* Findings list */}
      {findings.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
          <div className="text-center">
            <p className="text-[14px] font-semibold text-text-primary">
              No findings
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              All scans are clean. Keep up the good work.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {findings.map((finding, i) => (
            <Link
              key={finding.id}
              href={`/findings/${finding.id}`}
              className="animate-fade-up block focus-ring rounded-lg"
              style={{ animationDelay: `${0.03 + 0.04 * i}s` }}
              aria-label={`View finding: ${finding.title}`}
            >
              <FindingCard finding={finding} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
