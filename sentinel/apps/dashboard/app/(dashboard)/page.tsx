import { getOverviewStats, getRecentScans, getAIMetricsStats, getAIMetricsTrend } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconSearch,
  IconActivity,
  IconTrendingUp,
  IconCpu,
} from "@/components/icons";

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

const STAT_ICONS = [
  { Icon: IconActivity, accent: "text-accent", glow: "from-accent/20" },
  {
    Icon: IconAlertTriangle,
    accent: "text-status-fail",
    glow: "from-status-fail/20",
  },
  { Icon: IconSearch, accent: "text-status-warn", glow: "from-status-warn/20" },
  {
    Icon: IconShieldCheck,
    accent: "text-status-pass",
    glow: "from-status-pass/20",
  },
];

export default async function OverviewPage() {
  const [stats, recentScans, aiStats, aiTrend] = await Promise.all([
    getOverviewStats(),
    getRecentScans(10),
    getAIMetricsStats().catch(() => null),
    getAIMetricsTrend(30).catch(() => null),
  ]);

  const statCards = [
    {
      label: "Total Scans",
      value: stats.totalScans.toLocaleString(),
      sub: "Lifetime",
      trend: "+12%",
      trendUp: true,
    },
    {
      label: "Active Revocations",
      value: stats.activeRevocations.toString(),
      sub: "Requires attention",
      trend: stats.activeRevocations > 0 ? "Action needed" : "Clear",
      trendUp: false,
    },
    {
      label: "Open Findings",
      value: stats.openFindings.toString(),
      sub: "Across all projects",
      trend: "-8%",
      trendUp: true,
    },
    {
      label: "Pass Rate",
      value: `${stats.passRate}%`,
      sub: "Last 30 days",
      trend: "+3%",
      trendUp: true,
    },
  ];

  // Build chart data from recent scans
  const chartScans = [...recentScans]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-8);
  const maxRisk = Math.max(...chartScans.map((s) => s.riskScore), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Security posture and compliance status at a glance."
      />

      {/* Stat cards */}
      <section
        aria-label="Key metrics"
        className="animate-fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, i) => {
            const { Icon, accent, glow } = STAT_ICONS[i];
            return (
              <div
                key={card.label}
                className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5"
              >
                {/* Subtle gradient glow */}
                <div
                  className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-radial ${glow} to-transparent opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      {card.label}
                    </p>
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 ${accent}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                    {card.value}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-text-tertiary">{card.sub}</p>
                    <span
                      className={`text-[10px] font-semibold ${
                        card.trendUp
                          ? "text-status-pass"
                          : "text-status-warn"
                      }`}
                    >
                      {card.trend}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI Code Analysis */}
      {aiStats?.hasData && (
        <section
          aria-label="AI code analysis"
          className="animate-fade-up"
          style={{ animationDelay: "0.07s" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">
              AI Code Analysis
            </h2>
            <a
              href="/ai-metrics"
              className="text-[11px] font-medium text-accent hover:brightness-110 transition-colors"
            >
              View details
            </a>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* AI Code Ratio */}
            <div className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-radial from-accent/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    AI Code Ratio
                  </p>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-accent">
                    <IconCpu className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                  {(aiStats.stats.aiRatio * 100).toFixed(1)}%
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-text-tertiary">Of total codebase</p>
                  {aiTrend && (
                    <span
                      className={`text-[10px] font-semibold ${
                        aiTrend.momChange <= 0
                          ? "text-status-pass"
                          : "text-status-warn"
                      }`}
                    >
                      {aiTrend.momChange > 0 ? "+" : ""}
                      {(aiTrend.momChange * 100).toFixed(1)}% MoM
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* AI Influence */}
            <div className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-radial from-status-warn/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    AI Influence
                  </p>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-status-warn">
                    <IconTrendingUp className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                  {(aiStats.stats.aiInfluenceScore * 100).toFixed(1)}%
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-text-tertiary">Weighted influence score</p>
                </div>
              </div>
            </div>

            {/* AI Tools Detected */}
            <div className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5">
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-radial from-status-pass/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    AI Tools Detected
                  </p>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-status-pass">
                    <IconSearch className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight text-text-primary">
                  {aiStats.toolBreakdown.length}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[10px] text-text-tertiary">
                    {aiStats.toolBreakdown.length > 0
                      ? `Top: ${aiStats.toolBreakdown[0].tool}`
                      : "No tools detected"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Risk trend chart */}
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
              <div className="absolute left-0 right-0 border-t border-dashed border-status-fail/25" style={{ bottom: "50%" }}>
                <span className="absolute -top-3 right-0 text-[9px] text-status-fail/50">
                  50
                </span>
              </div>

              <div
                className="flex items-end gap-1.5"
                style={{ height: "160px" }}
              >
                {chartScans.map((scan, i) => {
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
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Activity feed */}
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
            </div>
          </div>
        </section>
      </div>

      {/* Recent scans table */}
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
            className="text-[11px] font-medium text-accent hover:brightness-110 transition-colors"
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
    </div>
  );
}
