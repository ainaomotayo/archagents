import { MOCK_SCANS } from "@/lib/mock-data";
import { PageHeader } from "@/components/page-header";

export default function DriftPage() {
  const sorted = [...MOCK_SCANS].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const trendData = sorted.map((scan, i) => ({
    date: new Date(scan.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    commit: scan.commit,
    branch: scan.branch,
    aiPercent: Math.min(100, Math.max(0, 15 + i * 3 + scan.riskScore * 0.1)),
    riskScore: scan.riskScore,
  }));

  const latestAi = trendData.at(-1)?.aiPercent ?? 0;
  const firstAi = trendData.at(0)?.aiPercent ?? 0;
  const drift = latestAi - firstAi;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Drift Analytics"
        description="Track AI-generated code composition trends over time."
      />

      {/* Summary cards */}
      <section aria-label="Drift metrics" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Current AI Composition</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {latestAi.toFixed(1)}%
            </p>
          </div>
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Drift (Period)</p>
            <p className={`mt-3 text-3xl font-bold tracking-tight ${drift > 0 ? "text-status-warn" : "text-status-pass"}`}>
              {drift > 0 ? "+" : ""}
              {drift.toFixed(1)}%
            </p>
          </div>
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Scans Analysed</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {trendData.length}
            </p>
          </div>
        </div>
      </section>

      {/* Trend chart */}
      <section aria-label="Drift trend chart" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">AI Composition Over Time</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-6">
          <div className="flex items-end gap-2" style={{ height: "200px" }}>
            {trendData.map((d, i) => (
              <div key={d.commit} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="chart-bar w-full rounded-t bg-accent/40 hover:bg-accent/70 transition-colors cursor-default"
                  style={{
                    height: `${d.aiPercent * 1.8}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                  title={`${d.date}: ${d.aiPercent.toFixed(1)}% AI`}
                />
                <span className="text-[10px] text-text-tertiary">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data table */}
      <section aria-label="Drift data" className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">Scan Details</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Date</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">AI %</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {[...trendData].reverse().map((d) => (
                <tr key={d.commit} className="table-row-hover transition-colors">
                  <td className="px-5 py-3.5 text-xs text-text-tertiary">{d.date}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-accent">{d.commit}</td>
                  <td className="px-5 py-3.5 text-text-secondary">{d.branch}</td>
                  <td className="px-5 py-3.5 font-mono text-text-secondary">{d.aiPercent.toFixed(1)}%</td>
                  <td className="px-5 py-3.5">
                    <span className={
                      d.riskScore >= 50
                        ? "font-semibold text-status-fail"
                        : d.riskScore >= 25
                          ? "font-semibold text-status-warn"
                          : "text-text-secondary"
                    }>
                      {d.riskScore}
                    </span>
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
