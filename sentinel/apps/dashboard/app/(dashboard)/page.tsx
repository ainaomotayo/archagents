import {
  getOverviewStats,
  getRecentScans,
  getComplianceScores,
  getAIMetricsStats,
  getFindings,
} from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { ProductExplainer } from "@/components/product-explainer";
import { IconShieldCheck } from "@/components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function OverviewPage() {
  const [stats, recentScans, complianceScores, aiStats, findings] = await Promise.all([
    getOverviewStats(),
    getRecentScans(10),
    getComplianceScores().catch(() => []),
    getAIMetricsStats().catch(() => null),
    getFindings().catch(() => []),
  ]);

  const isNewOrg = stats.totalScans === 0;

  // Org health grade calculation
  // FrameworkScore.score is 0.0–1.0, so multiply by 100 for percentage
  const complianceAvg =
    complianceScores.length > 0
      ? Math.round(
          complianceScores.reduce((sum, fw) => sum + fw.score * 100, 0) /
            complianceScores.length,
        )
      : 0;

  // Per-severity finding breakdown
  const openFindings = findings.filter((f) => f.status === "open");
  const severityCounts = {
    critical: openFindings.filter((f) => f.severity === "critical").length,
    high: openFindings.filter((f) => f.severity === "high").length,
    medium: openFindings.filter((f) => f.severity === "medium").length,
    low: openFindings.filter((f) => f.severity === "low").length,
  };
  const totalOpenFindings = openFindings.length;
  const criticalRatio = totalOpenFindings > 0 ? severityCounts.critical / totalOpenFindings : 0;

  function calcGrade(
    passRate: number,
    compAvg: number,
    criticalRatio: number,
  ): { grade: string; color: string; ringColor: string } {
    if (passRate === 0 && compAvg === 0)
      return {
        grade: "—",
        color: "text-text-tertiary",
        ringColor: "stroke-border",
      };
    const score = passRate * 0.5 + compAvg * 0.3 + (1 - criticalRatio) * 20;
    if (score >= 90)
      return {
        grade: "A",
        color: "text-status-pass",
        ringColor: "stroke-status-pass",
      };
    if (score >= 75)
      return {
        grade: "B",
        color: "text-status-pass",
        ringColor: "stroke-status-pass",
      };
    if (score >= 60)
      return {
        grade: "C",
        color: "text-status-warn",
        ringColor: "stroke-status-warn",
      };
    if (score >= 45)
      return {
        grade: "D",
        color: "text-status-fail",
        ringColor: "stroke-status-fail",
      };
    return {
      grade: "F",
      color: "text-status-fail",
      ringColor: "stroke-status-fail",
    };
  }

  const { grade, color: gradeColor, ringColor } = calcGrade(
    stats.passRate,
    complianceAvg,
    criticalRatio,
  );

  // Risk trend delta (real, not hardcoded)
  const midpoint = Math.floor(recentScans.length / 2);
  const older = recentScans.slice(0, midpoint);
  const newer = recentScans.slice(midpoint);
  const avgRisk = (scans: typeof recentScans) =>
    scans.length > 0
      ? scans.reduce((s, sc) => s + sc.riskScore, 0) / scans.length
      : null;
  const oldAvg = avgRisk(older);
  const newAvg = avgRisk(newer);
  const riskDelta =
    oldAvg !== null && newAvg !== null && oldAvg > 0
      ? Math.round(((newAvg - oldAvg) / oldAvg) * 100)
      : null;

  // Chart data
  const chartScans = [...recentScans]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-8);
  const maxRisk = Math.max(...chartScans.map((s) => s.riskScore), 1);

  // Onboarding checklist completedSteps derived from real data
  const completedSteps: string[] = [];
  if (stats.totalScans > 0) completedSteps.push("connect", "scan");
  if (stats.openFindings >= 0 && stats.totalScans > 0)
    completedSteps.push("review");
  if (complianceAvg > 0) completedSteps.push("compliance");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Security posture and compliance status at a glance."
      />

      {/* ZONE 1: Onboarding banner (new orgs) OR Org Health Hero (existing orgs) */}
      {isNewOrg ? (
        <OnboardingBanner />
      ) : (
        <section
          aria-label="Security posture"
          className="animate-fade-up"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="rounded-xl border border-border bg-surface-1 p-6">
            <div className="flex items-center gap-8">
              {/* Grade ring */}
              <div className="flex flex-shrink-0 flex-col items-center gap-2">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg
                    className="absolute inset-0 h-24 w-24 -rotate-90"
                    viewBox="0 0 96 96"
                  >
                    {/* Background ring */}
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      className="text-surface-3"
                    />
                    {/* Progress ring — circumference = 2π×40 ≈ 251.3 */}
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="none"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="251.3"
                      strokeDashoffset={
                        grade === "—"
                          ? 251.3
                          : 251.3 * (1 - stats.passRate / 100)
                      }
                      className={ringColor}
                    />
                  </svg>
                  <div className="relative text-center">
                    <span className={`text-3xl font-bold ${gradeColor}`}>
                      {grade}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  Security Posture
                </p>
              </div>

              {/* Divider */}
              <div className="h-16 w-px bg-border" />

              {/* KPI row */}
              <div className="flex flex-1 flex-wrap items-center gap-8">
                {/* Total Scans */}
                <div>
                  <p className="text-2xl font-bold text-text-primary">
                    {stats.totalScans > 0
                      ? stats.totalScans.toLocaleString()
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Total Scans
                  </p>
                  {riskDelta !== null && (
                    <p
                      className={`mt-0.5 text-[10px] font-medium ${riskDelta <= 0 ? "text-status-pass" : "text-status-fail"}`}
                    >
                      {riskDelta > 0 ? "+" : ""}
                      {riskDelta}% risk trend
                    </p>
                  )}
                </div>

                <div className="h-8 w-px bg-border-subtle" />

                {/* Open Findings */}
                <div>
                  <p
                    className={`text-2xl font-bold ${stats.openFindings > 0 ? "text-status-fail" : "text-text-primary"}`}
                  >
                    {stats.totalScans > 0 ? stats.openFindings : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Open Findings
                  </p>
                </div>

                <div className="h-8 w-px bg-border-subtle" />

                {/* Pass Rate */}
                <div>
                  <p
                    className={`text-2xl font-bold ${
                      stats.passRate >= 80
                        ? "text-status-pass"
                        : stats.passRate >= 60
                          ? "text-status-warn"
                          : "text-status-fail"
                    }`}
                  >
                    {stats.totalScans > 0 ? `${stats.passRate}%` : "—"}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Pass Rate
                  </p>
                  <p className="mt-0.5 text-[10px] text-text-tertiary">
                    Last 30 days
                  </p>
                </div>

                {/* Active Revocations — only if > 0 */}
                {stats.activeRevocations > 0 && (
                  <>
                    <div className="h-8 w-px bg-border-subtle" />
                    <div>
                      <p className="text-2xl font-bold text-status-fail">
                        {stats.activeRevocations}
                      </p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                        Revocations
                      </p>
                      <p className="mt-0.5 text-[10px] font-medium text-status-fail">
                        Action needed
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ZONE 2: Insights grid (3 columns) — only when !isNewOrg */}
      {!isNewOrg && (
        <section
          aria-label="Security insights"
          className="animate-fade-up"
          style={{ animationDelay: "0.08s" }}
        >
          <div
            className={`grid grid-cols-1 gap-4 ${aiStats?.hasData ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
          >
            {/* Security Posture card */}
            <div className="rounded-xl border border-border bg-surface-1 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Security
              </h3>
              {totalOpenFindings === 0 ? (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <IconShieldCheck className="h-5 w-5 text-status-pass" />
                    <p className="text-[13px] font-medium text-status-pass">
                      No open findings
                    </p>
                  </div>
                  <p className="mt-3 text-[12px] text-text-tertiary">Run a scan to see your security posture</p>
                </>
              ) : (
                <div className="mt-3">
                  <p className="text-2xl font-bold text-status-fail">
                    {totalOpenFindings}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-tertiary">
                    open findings require attention
                  </p>
                  {/* Severity bar */}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      {severityCounts.critical > 0 && (
                        <div
                          style={{ width: `${(severityCounts.critical / totalOpenFindings) * 100}%` }}
                          className="bg-severity-critical"
                        />
                      )}
                      {severityCounts.high > 0 && (
                        <div
                          style={{ width: `${(severityCounts.high / totalOpenFindings) * 100}%` }}
                          className="bg-severity-high"
                        />
                      )}
                      {severityCounts.medium > 0 && (
                        <div
                          style={{ width: `${(severityCounts.medium / totalOpenFindings) * 100}%` }}
                          className="bg-severity-medium"
                        />
                      )}
                      {severityCounts.low > 0 && (
                        <div
                          style={{ width: `${(severityCounts.low / totalOpenFindings) * 100}%` }}
                          className="bg-severity-low"
                        />
                      )}
                    </div>
                    <div className="flex gap-3 text-[10px] text-text-tertiary">
                      {severityCounts.critical > 0 && (
                        <span>
                          <span className="text-severity-critical font-semibold">{severityCounts.critical}</span> Critical
                        </span>
                      )}
                      {severityCounts.high > 0 && (
                        <span>
                          <span className="text-severity-high font-semibold">{severityCounts.high}</span> High
                        </span>
                      )}
                      {severityCounts.medium > 0 && (
                        <span>
                          <span className="text-severity-medium font-semibold">{severityCounts.medium}</span> Medium
                        </span>
                      )}
                      {severityCounts.low > 0 && (
                        <span>
                          <span className="text-severity-low font-semibold">{severityCounts.low}</span> Low
                        </span>
                      )}
                    </div>
                  </div>
                  <a
                    href="/findings"
                    className="mt-3 block text-[11px] font-medium text-accent transition-colors hover:brightness-110"
                  >
                    Review findings →
                  </a>
                </div>
              )}
            </div>

            {/* Compliance Readiness card */}
            <div className="rounded-xl border border-border bg-surface-1 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Compliance
              </h3>
              {complianceScores.length === 0 ? (
                <p className="mt-3 text-[12px] text-text-tertiary">
                  No frameworks configured
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {complianceScores.slice(0, 3).map((fw) => {
                    const pct = Math.round(fw.score * 100);
                    return (
                      <div key={fw.frameworkSlug}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="max-w-[120px] truncate text-[11px] font-medium text-text-secondary">
                            {fw.frameworkName}
                          </span>
                          <span
                            className={`text-[11px] font-bold ${pct >= 80 ? "text-status-pass" : pct >= 60 ? "text-status-warn" : "text-status-fail"}`}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-status-pass" : pct >= 60 ? "bg-status-warn" : "bg-status-fail"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <a
                    href="/compliance"
                    className="block text-[11px] font-medium text-accent transition-colors hover:brightness-110"
                  >
                    View full report →
                  </a>
                </div>
              )}
            </div>

            {/* AI Governance card — only when hasData */}
            {aiStats?.hasData && (
              <div className="rounded-xl border border-border bg-surface-1 p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                  AI Governance
                </h3>
                <div className="mt-3">
                  <p className="text-2xl font-bold text-text-primary">
                    {(aiStats.stats.aiRatio * 100).toFixed(1)}%
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-tertiary">
                    AI code detected
                  </p>
                  {aiStats.toolBreakdown.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-[10px] font-semibold text-text-secondary">
                        Top: {aiStats.toolBreakdown[0].tool}
                      </span>
                    </div>
                  )}
                  <a
                    href="/ai-metrics"
                    className="mt-3 block text-[11px] font-medium text-accent transition-colors hover:brightness-110"
                  >
                    View AI metrics →
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ZONE 3: Activity row — risk chart (2/3) + checklist/activity feed (1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Risk trend chart — left 2/3 */}
        <section
          aria-label="Risk trend"
          className="animate-fade-up lg:col-span-2"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">
                  Risk Trend
                </h2>
                <p className="mt-0.5 text-[11px] text-text-tertiary">
                  Risk scores across recent scans
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  Risk Score
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-status-fail/40" />
                  Threshold
                </span>
              </div>
            </div>

            {/* Chart */}
            <div className="relative">
              {/* Threshold line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-status-fail/25"
                style={{ bottom: "50%" }}
              >
                <span className="absolute -top-3 right-0 text-[9px] text-status-fail/50">
                  50
                </span>
              </div>

              <div className="flex items-end gap-1.5" style={{ height: "160px" }}>
                {chartScans.length === 0 ? (
                  <div className="flex w-full flex-col items-center justify-center gap-2 py-8">
                    <svg className="h-8 w-8 text-text-tertiary/40" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="3" y="12" width="4" height="9" rx="1" />
                      <rect x="10" y="7" width="4" height="14" rx="1" />
                      <rect x="17" y="4" width="4" height="17" rx="1" />
                    </svg>
                    <p className="text-[12px] text-text-tertiary">No scan history yet</p>
                  </div>
                ) : (
                  chartScans.map((scan, i) => {
                    const height = Math.max(
                      (scan.riskScore / maxRisk) * 90,
                      6,
                    );
                    const barColor =
                      scan.riskScore >= 50
                        ? "bg-status-fail"
                        : scan.riskScore >= 25
                          ? "bg-status-warn"
                          : "bg-accent";

                    return (
                      <div
                        key={scan.id}
                        className="group/bar flex flex-1 flex-col items-center gap-1"
                      >
                        {/* Tooltip */}
                        <div className="invisible mb-1 rounded-md bg-surface-4 px-2 py-1 text-[10px] text-text-primary shadow-lg group-hover/bar:visible">
                          {scan.riskScore}
                        </div>
                        <div
                          className={`chart-bar w-full rounded-t ${barColor} opacity-80 transition-opacity hover:opacity-100`}
                          style={{
                            height: `${height}%`,
                            animationDelay: `${i * 0.08}s`,
                          }}
                        />
                        <span className="text-[9px] text-text-tertiary">
                          {new Date(scan.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Right 1/3: checklist (new orgs) OR activity feed (existing orgs) */}
        {isNewOrg ? (
          <section
            aria-label="Getting started"
            className="animate-fade-up"
            style={{ animationDelay: "0.15s" }}
          >
            <OnboardingChecklist completedSteps={completedSteps} />
          </section>
        ) : (
          <section
            aria-label="Recent activity"
            className="animate-fade-up"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="rounded-xl border border-border bg-surface-1 p-5">
              <h2 className="text-sm font-semibold text-text-primary">
                Recent Activity
              </h2>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                Latest scan events
              </p>

              <div className="mt-4 space-y-0">
                {recentScans.slice(0, 6).map((scan, i) => (
                  <div
                    key={scan.id}
                    className="group relative flex gap-3 py-2.5"
                  >
                    {/* Timeline line */}
                    {i < 5 && (
                      <div className="absolute bottom-0 left-[9px] top-8 w-px bg-border-subtle" />
                    )}
                    {/* Dot */}
                    <div
                      className={`relative z-10 mt-0.5 h-[18px] w-[18px] flex-shrink-0 rounded-full border-2 ${
                        scan.status === "pass"
                          ? "border-status-pass bg-status-pass/20"
                          : scan.status === "fail"
                            ? "border-status-fail bg-status-fail/20"
                            : scan.status === "running"
                              ? "border-status-running bg-status-running/20"
                              : "border-status-warn bg-status-warn/20"
                      }`}
                    >
                      <div
                        className={`absolute inset-[4px] rounded-full ${
                          scan.status === "pass"
                            ? "bg-status-pass"
                            : scan.status === "fail"
                              ? "bg-status-fail"
                              : scan.status === "running"
                                ? "bg-status-running"
                                : "bg-status-warn"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-[11px] text-accent">
                          {scan.commit}
                        </span>
                        <StatusBadge status={scan.status} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-tertiary">
                        {scan.branch} &middot; {formatRelative(scan.date)}
                      </p>
                    </div>
                  </div>
                ))}
                {recentScans.length === 0 && (
                  <p className="py-4 text-center text-[12px] text-text-tertiary">
                    Activity will appear here after your first scan
                  </p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ZONE 4: Product explainer — only when isNewOrg */}
      {isNewOrg && (
        <section
          id="product-explainer"
          aria-label="How SENTINEL works"
          className="animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-text-primary">
              How SENTINEL works
            </h2>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              Automated governance for every commit
            </p>
          </div>
          <ProductExplainer />
        </section>
      )}

      {/* Recent scans table — only when !isNewOrg */}
      {!isNewOrg && (
        <section
          aria-label="Recent scans"
          className="animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              Recent Scans
            </h2>
            <a
              href="/projects"
              className="text-[11px] font-medium text-accent transition-colors hover:brightness-110"
            >
              View all projects
            </a>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th
                    scope="col"
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                  >
                    Commit
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                  >
                    Branch
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                  >
                    Risk Score
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {recentScans.slice(0, 5).map((scan) => (
                  <tr
                    key={scan.id}
                    className="table-row-hover transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-accent">
                      {scan.commit}
                    </td>
                    <td className="px-5 py-3 text-text-secondary">
                      {scan.branch}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={scan.status} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full rounded-full transition-all ${
                              scan.riskScore >= 50
                                ? "bg-status-fail"
                                : scan.riskScore >= 25
                                  ? "bg-status-warn"
                                  : "bg-status-pass"
                            }`}
                            style={{ width: `${scan.riskScore}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono text-xs ${
                            scan.riskScore >= 50
                              ? "text-status-fail"
                              : scan.riskScore >= 25
                                ? "text-status-warn"
                                : "text-text-secondary"
                          }`}
                        >
                          {scan.riskScore}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-text-tertiary">
                      {formatDate(scan.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
