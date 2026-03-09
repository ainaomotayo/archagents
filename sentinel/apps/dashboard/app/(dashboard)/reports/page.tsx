import { MOCK_SCANS, MOCK_FINDINGS, MOCK_CERTIFICATES } from "@/lib/mock-data";
import { generateReportData, generateReportHtml } from "@/lib/report-generator";
import { assessCompliance } from "@/lib/eu-ai-act";

export default function ReportsPage() {
  const reportData = generateReportData(
    MOCK_SCANS,
    MOCK_FINDINGS,
    MOCK_CERTIFICATES,
  );
  const euAssessment = assessCompliance(MOCK_SCANS, MOCK_CERTIFICATES);

  // Pre-generate HTML for download (base64 data URI)
  const html = generateReportHtml(reportData);
  const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  const trendStyles = {
    improving: "text-green-400",
    stable: "text-yellow-400",
    degrading: "text-red-400",
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Reports</h1>
          <p className="mt-1 text-slate-400">
            Generate and download compliance reports.
          </p>
        </div>
        <a
          href={dataUri}
          download="sentinel-compliance-report.html"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Download Report (HTML)
        </a>
      </div>

      {/* Summary cards */}
      <section aria-label="Report summary">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Total Scans</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {reportData.summary.totalScans}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Pass Rate</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {reportData.summary.passRate}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">Risk Trend</p>
            <p
              className={`mt-2 text-2xl font-bold capitalize ${trendStyles[reportData.summary.riskTrend]}`}
            >
              {reportData.summary.riskTrend}
            </p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm text-slate-400">EU AI Act Score</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {euAssessment.complianceScore}%
            </p>
          </div>
        </div>
      </section>

      {/* EU AI Act */}
      <section aria-label="EU AI Act compliance">
        <h2 className="mb-4 text-lg font-semibold text-white">
          EU AI Act Compliance
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Article</th>
                <th scope="col" className="px-4 py-3">Title</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {euAssessment.requirements.map((req) => (
                <tr key={req.article} className="bg-slate-950 text-slate-300">
                  <td className="px-4 py-3 font-mono text-xs">{req.article}</td>
                  <td className="px-4 py-3">{req.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        req.status === "compliant"
                          ? "bg-green-900/50 text-green-300"
                          : req.status === "partial"
                            ? "bg-yellow-900/50 text-yellow-300"
                            : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SOC 2 */}
      <section aria-label="SOC 2 controls">
        <h2 className="mb-4 text-lg font-semibold text-white">
          SOC 2 Control Mapping
        </h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Control</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {reportData.compliance.soc2Controls.map((ctrl) => (
                <tr key={ctrl.control} className="bg-slate-950 text-slate-300">
                  <td className="px-4 py-3">{ctrl.control}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium uppercase ${
                        ctrl.status === "met"
                          ? "bg-green-900/50 text-green-300"
                          : ctrl.status === "partial"
                            ? "bg-yellow-900/50 text-yellow-300"
                            : "bg-red-900/50 text-red-300"
                      }`}
                    >
                      {ctrl.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top findings */}
      {reportData.summary.topFindings.length > 0 && (
        <section aria-label="Top findings">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Top Finding Categories
          </h2>
          <div className="space-y-2">
            {reportData.summary.topFindings.map((f) => (
              <div
                key={f.category}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <span className="text-sm text-slate-300 capitalize">
                  {f.category.replace(/-/g, " ")}
                </span>
                <span className="text-sm font-bold text-white">{f.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
