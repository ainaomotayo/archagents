import { getOverviewStats, getRecentScans } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { IconShieldCheck, IconAlertTriangle, IconSearch, IconActivity } from "@/components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STAT_ICONS = [
  { Icon: IconActivity, accent: "text-accent" },
  { Icon: IconAlertTriangle, accent: "text-status-fail" },
  { Icon: IconSearch, accent: "text-status-warn" },
  { Icon: IconShieldCheck, accent: "text-status-pass" },
];

export default async function OverviewPage() {
  const stats = await getOverviewStats();
  const recentScans = await getRecentScans(5);

  const statCards = [
    { label: "Total Scans", value: stats.totalScans.toLocaleString(), sub: "Lifetime" },
    { label: "Active Revocations", value: stats.activeRevocations.toString(), sub: "Requires attention" },
    { label: "Open Findings", value: stats.openFindings.toString(), sub: "Across all projects" },
    { label: "Pass Rate", value: `${stats.passRate}%`, sub: "Last 30 days" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Security posture and compliance status at a glance."
      />

      {/* Stat cards */}
      <section aria-label="Key metrics" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, i) => {
            const { Icon, accent } = STAT_ICONS[i];
            return (
              <div
                key={card.label}
                className="stat-card rounded-xl border border-border bg-surface-1 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    {card.label}
                  </p>
                  <Icon className={`h-4 w-4 ${accent}`} />
                </div>
                <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
                  {card.value}
                </p>
                <p className="mt-1 text-[11px] text-text-tertiary">{card.sub}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent scans */}
      <section aria-label="Recent scans" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Recent Scans</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk Score</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {recentScans.map((scan) => (
                <tr key={scan.id} className="table-row-hover transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-accent">{scan.commit}</td>
                  <td className="px-5 py-3.5 text-text-secondary">{scan.branch}</td>
                  <td className="px-5 py-3.5">
                    <StatusBadge status={scan.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={
                      scan.riskScore >= 50
                        ? "font-semibold text-status-fail"
                        : scan.riskScore >= 25
                          ? "font-semibold text-status-warn"
                          : "text-text-secondary"
                    }>
                      {scan.riskScore}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-text-tertiary">
                    {formatDate(scan.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Risk trend placeholder */}
      <section aria-label="Risk trend" className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">
          Risk Trend (Last 30 Days)
        </h2>
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1 grid-pattern">
          <p className="text-[13px] text-text-tertiary">
            Chart integration pending
          </p>
        </div>
      </section>
    </div>
  );
}
