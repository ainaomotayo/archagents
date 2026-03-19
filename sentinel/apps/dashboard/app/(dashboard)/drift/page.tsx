import { getRecentScans } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import {
  IconActivity,
  IconTrendingUp,
  IconBarChart,
} from "@/components/icons";

const STAT_ICONS = [
  { Icon: IconActivity, accent: "text-accent", glow: "from-accent/20" },
  { Icon: IconTrendingUp, accent: "text-status-warn", glow: "from-status-warn/20" },
  { Icon: IconBarChart, accent: "text-status-pass", glow: "from-status-pass/20" },
];

export default async function DriftPage() {
  const scans = await getRecentScans(20);
  const sorted = [...scans].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const trendData = sorted.map((scan) => ({
    date: new Date(scan.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    commit: scan.commit,
    branch: scan.branch,
    riskScore: scan.riskScore,
  }));

  const latestRisk = trendData.at(-1)?.riskScore ?? 0;
  const firstRisk = trendData.at(0)?.riskScore ?? 0;
  const drift = latestRisk - firstRisk;
  const maxPercent = Math.max(...trendData.map((d) => d.riskScore), 1);

  const statCards = [
    {
      label: "Latest Risk Score",
      value: latestRisk.toFixed(0),
      sub: "Across last scan",
      trend: latestRisk > 50 ? "Above threshold" : "Within threshold",
      trendUp: latestRisk <= 50,
    },
    {
      label: "Drift (Period)",
      value: `${drift > 0 ? "+" : ""}${drift.toFixed(1)}%`,
      sub: `Over ${trendData.length} scans`,
      trend: drift > 0 ? "Increasing" : "Stable",
      trendUp: drift <= 0,
      valueColor: drift > 0 ? "text-status-warn" : "text-status-pass",
    },
    {
      label: "Scans Analysed",
      value: trendData.length.toString(),
      sub: "Total in period",
      trend: "Complete",
      trendUp: true,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Drift Analytics"
        description="Track AI-generated code composition trends over time."
      />

      {/* Summary cards */}
      <section aria-label="Drift metrics" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                  <p className={`mt-2 text-3xl font-bold tracking-tight ${
                    "valueColor" in card && card.valueColor
                      ? card.valueColor
                      : "text-text-primary"
                  }`}>
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

      {/* Trend chart */}
      <section aria-label="Drift trend chart" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <div className="rounded-xl border border-border bg-surface-1 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Estimated AI Composition Over Time</h2>
              <p className="mt-0.5 text-[11px] text-text-tertiary">
                Estimated from risk score — real AI composition metrics coming soon
              </p>
            </div>
            {/* Chart legend */}
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="text-text-tertiary">Under 50%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-status-warn" />
                <span className="text-text-tertiary">50% &ndash; 75%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-status-fail" />
                <span className="text-text-tertiary">Above 75%</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[1px] w-3 border-t border-dashed border-status-fail/50" />
                <span className="text-text-tertiary">Threshold (50%)</span>
              </span>
            </div>
          </div>

          {/* Chart */}
          <div className="relative">
            {/* Threshold line at 50% */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-status-fail/25"
              style={{ bottom: `${(50 / maxPercent) * 90}%` }}
            >
              <span className="absolute -top-3 right-0 text-[9px] text-status-fail/50">
                50%
              </span>
            </div>

            <div className="flex items-end gap-1.5" style={{ height: "200px" }}>
              {trendData.map((d, i) => {
                const height = Math.max((d.riskScore / maxPercent) * 90, 6);
                const barColor =
                  d.riskScore >= 75
                    ? "bg-status-fail"
                    : d.riskScore >= 50
                      ? "bg-status-warn"
                      : "bg-accent";

                return (
                  <div
                    key={d.commit}
                    className="group/bar flex flex-1 flex-col items-center gap-1"
                  >
                    {/* Tooltip */}
                    <div className="invisible mb-1 whitespace-nowrap rounded-md bg-surface-4 px-2.5 py-1.5 text-[10px] text-text-primary shadow-lg group-hover/bar:visible">
                      <span className="font-semibold">Risk: {d.riskScore}</span>
                    </div>
                    <div
                      className={`chart-bar w-full rounded-t ${barColor} opacity-80 transition-opacity hover:opacity-100`}
                      style={{
                        height: `${height}%`,
                        animationDelay: `${i * 0.08}s`,
                      }}
                    />
                    <span className="text-[9px] text-text-tertiary">{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Data table */}
      <section aria-label="Drift data" className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Scan Details</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Date</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {[...trendData].reverse().map((d) => (
                <tr key={d.commit} className="table-row-hover transition-colors">
                  <td className="px-5 py-3.5 text-xs text-text-tertiary">{d.date}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-accent">{d.commit}</td>
                  <td className="px-5 py-3.5 text-text-secondary">{d.branch}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full transition-all ${
                            d.riskScore >= 50
                              ? "bg-status-fail"
                              : d.riskScore >= 25
                                ? "bg-status-warn"
                                : "bg-status-pass"
                          }`}
                          style={{ width: `${d.riskScore}%` }}
                        />
                      </div>
                      <span
                        className={`font-mono text-xs ${
                          d.riskScore >= 50
                            ? "text-status-fail"
                            : d.riskScore >= 25
                              ? "text-status-warn"
                              : "text-text-secondary"
                        }`}
                      >
                        {d.riskScore}
                      </span>
                    </div>
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
