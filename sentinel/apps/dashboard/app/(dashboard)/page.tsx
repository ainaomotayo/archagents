import { getOverviewStats, getRecentScans } from "@/lib/api";
import type { ScanStatus } from "@/lib/types";

const STATUS_STYLES: Record<ScanStatus, string> = {
  pass: "bg-green-900/50 text-green-300",
  fail: "bg-red-900/50 text-red-300",
  provisional: "bg-yellow-900/50 text-yellow-300",
  running: "bg-blue-900/50 text-blue-300",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OverviewPage() {
  const stats = await getOverviewStats();
  const recentScans = await getRecentScans(5);

  const statCards = [
    { label: "Total Scans", value: stats.totalScans.toLocaleString() },
    { label: "Active Revocations", value: stats.activeRevocations.toString() },
    { label: "Open Findings", value: stats.openFindings.toString() },
    { label: "Pass Rate", value: `${stats.passRate}%` },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-slate-400">
          SENTINEL security posture at a glance.
        </p>
      </div>

      {/* Stat cards */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-slate-800 bg-slate-900 p-6"
            >
              <p className="text-sm text-slate-400">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent scans */}
      <section aria-label="Recent scans">
        <h2 className="mb-4 text-lg font-semibold text-white">Recent Scans</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Commit</th>
                <th scope="col" className="px-4 py-3">Branch</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Risk Score</th>
                <th scope="col" className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {recentScans.map((scan) => (
                <tr key={scan.id} className="bg-slate-950 text-slate-300">
                  <td className="px-4 py-3 font-mono text-xs">{scan.commit}</td>
                  <td className="px-4 py-3">{scan.branch}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[scan.status]}`}
                    >
                      {scan.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{scan.riskScore}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatDate(scan.date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Risk trend placeholder */}
      <section aria-label="Risk trend">
        <h2 className="mb-4 text-lg font-semibold text-white">
          Risk Trend (Last 30 Days)
        </h2>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50">
          <p className="text-sm text-slate-500">
            Chart placeholder — integrate with a charting library
          </p>
        </div>
      </section>
    </div>
  );
}
