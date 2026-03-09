import { getRecentScans, getFindings, getCertificates } from "@/lib/api";
import { generateReportData, generateReportHtml } from "@/lib/report-generator";
import { assessCompliance } from "@/lib/eu-ai-act";
import { PageHeader } from "@/components/page-header";
import { IconDownload } from "@/components/icons";

export default async function ReportsPage() {
  const [scans, findings, certificates] = await Promise.all([
    getRecentScans(100),
    getFindings(),
    getCertificates(),
  ]);

  const reportData = generateReportData(scans, findings, certificates);
  const euAssessment = assessCompliance(scans, certificates);

  const html = generateReportHtml(reportData);
  const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  const trendStyles = {
    improving: "text-status-pass",
    stable: "text-status-warn",
    degrading: "text-status-fail",
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Generate and download compliance reports for auditing."
        action={
          <a
            href={dataUri}
            download="sentinel-compliance-report.html"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-text-inverse transition-all hover:brightness-110 focus-ring"
          >
            <IconDownload className="h-4 w-4" />
            Download Report
          </a>
        }
      />

      {/* Summary cards */}
      <section aria-label="Report summary" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Total Scans</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {reportData.summary.totalScans}
            </p>
          </div>
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Pass Rate</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {reportData.summary.passRate}%
            </p>
          </div>
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Risk Trend</p>
            <p className={`mt-3 text-3xl font-bold tracking-tight capitalize ${trendStyles[reportData.summary.riskTrend]}`}>
              {reportData.summary.riskTrend}
            </p>
          </div>
          <div className="stat-card rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">EU AI Act Score</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-text-primary">
              {euAssessment.complianceScore}%
            </p>
          </div>
        </div>
      </section>

      {/* EU AI Act */}
      <section aria-label="EU AI Act compliance" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">EU AI Act Compliance</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Article</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Title</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {euAssessment.requirements.map((req) => (
                <tr key={req.article} className="table-row-hover transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs text-accent">{req.article}</td>
                  <td className="px-5 py-3.5 text-text-secondary">{req.title}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        req.status === "compliant"
                          ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                          : req.status === "partial"
                            ? "bg-status-warn/15 text-status-warn border-status-warn/30"
                            : "bg-surface-3 text-text-tertiary border-border"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        req.status === "compliant" ? "bg-status-pass" : req.status === "partial" ? "bg-status-warn" : "bg-text-tertiary"
                      }`} />
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
      <section aria-label="SOC 2 controls" className="animate-fade-up" style={{ animationDelay: "0.25s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">SOC 2 Control Mapping</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Control</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {reportData.compliance.soc2Controls.map((ctrl) => (
                <tr key={ctrl.control} className="table-row-hover transition-colors">
                  <td className="px-5 py-3.5 text-text-secondary">{ctrl.control}</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        ctrl.status === "met"
                          ? "bg-status-pass/15 text-status-pass border-status-pass/30"
                          : ctrl.status === "partial"
                            ? "bg-status-warn/15 text-status-warn border-status-warn/30"
                            : "bg-status-fail/15 text-status-fail border-status-fail/30"
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
        <section aria-label="Top findings" className="animate-fade-up" style={{ animationDelay: "0.35s" }}>
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Top Finding Categories</h2>
          <div className="space-y-2">
            {reportData.summary.topFindings.map((f) => (
              <div
                key={f.category}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-1 px-5 py-3.5"
              >
                <span className="text-[13px] capitalize text-text-secondary">
                  {f.category.replace(/-/g, " ")}
                </span>
                <span className="font-mono text-sm font-bold text-text-primary">{f.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
