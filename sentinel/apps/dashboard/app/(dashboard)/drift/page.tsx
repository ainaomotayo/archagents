import { MOCK_SCANS } from "@/lib/mock-data";

/**
 * Drift Analytics — shows AI composition trend data.
 *
 * In a full implementation this would pull real drift metrics
 * from the SENTINEL API. For the MVP we derive trends from scan data.
 */
export default function DriftPage() {
  const sorted = [...MOCK_SCANS].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Simulate AI composition percentages derived from scan metadata
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
      <div>
        <h1 className="text-3xl font-bold text-white">Drift Analytics</h1>
        <p className="mt-1 text-slate-400">
          Track AI-generated code composition trends over time.
        </p>
      </div>

      {/* Summary cards */}
      <section aria-label="Drift metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Current AI Composition</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {latestAi.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Drift (Period)</p>
            <p
              className={`mt-2 text-2xl font-bold ${drift > 0 ? "text-yellow-400" : "text-green-400"}`}
            >
              {drift > 0 ? "+" : ""}
              {drift.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Scans Analysed</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {trendData.length}
            </p>
          </div>
        </div>
      </section>

      {/* Trend chart placeholder */}
      <section aria-label="Drift trend chart">
        <h2 className="mb-4 text-lg font-semibold text-white">
          AI Composition Over Time
        </h2>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-end gap-2" style={{ height: "200px" }}>
            {trendData.map((d) => (
              <div key={d.commit} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-blue-500/70"
                  style={{ height: `${d.aiPercent * 1.8}px` }}
                  title={`${d.date}: ${d.aiPercent.toFixed(1)}% AI`}
                />
                <span className="text-xs text-slate-500">{d.date}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data table */}
      <section aria-label="Drift data">
        <h2 className="mb-4 text-lg font-semibold text-white">Scan Details</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Date</th>
                <th scope="col" className="px-4 py-3">Commit</th>
                <th scope="col" className="px-4 py-3">Branch</th>
                <th scope="col" className="px-4 py-3">AI %</th>
                <th scope="col" className="px-4 py-3">Risk Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[...trendData].reverse().map((d) => (
                <tr key={d.commit} className="bg-slate-950 text-slate-300">
                  <td className="px-4 py-3 text-xs text-slate-500">{d.date}</td>
                  <td className="px-4 py-3 font-mono text-xs">{d.commit}</td>
                  <td className="px-4 py-3">{d.branch}</td>
                  <td className="px-4 py-3">{d.aiPercent.toFixed(1)}%</td>
                  <td className="px-4 py-3">{d.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
