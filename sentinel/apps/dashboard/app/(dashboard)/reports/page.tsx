import { getRecentScans, getFindings, getCertificates } from "@/lib/api";
import { generateReportData, generateReportHtml } from "@/lib/report-generator";
import { assessCompliance } from "@/lib/eu-ai-act";
import { PageHeader } from "@/components/page-header";
import {
  IconDownload,
  IconActivity,
  IconShieldCheck,
  IconTrendingUp,
  IconShield,
  IconBarChart,
} from "@/components/icons";

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

  const trendLabels: Record<string, { sub: string; trend: string; trendUp: boolean }> = {
    improving: { sub: "Trending down", trend: "-12%", trendUp: true },
    stable: { sub: "No change", trend: "0%", trendUp: false },
    degrading: { sub: "Trending up", trend: "+8%", trendUp: false },
  };

  const riskTrendMeta = trendLabels[reportData.summary.riskTrend] ?? trendLabels.stable;

  const euScore = euAssessment.complianceScore;
  const euScoreColor =
    euScore >= 80 ? "bg-status-pass" : euScore >= 50 ? "bg-status-warn" : "bg-status-fail";
  const euScoreText =
    euScore >= 80 ? "text-status-pass" : euScore >= 50 ? "text-status-warn" : "text-status-fail";

  const STAT_CARDS = [
    {
      label: "Total Scans",
      value: reportData.summary.totalScans.toLocaleString(),
      sub: "Lifetime total",
      trend: "+12%",
      trendUp: true,
      Icon: IconActivity,
      accent: "text-accent",
      glow: "from-accent/20",
    },
    {
      label: "Pass Rate",
      value: `${reportData.summary.passRate}%`,
      sub: "Across all scans",
      trend: reportData.summary.passRate >= 80 ? "+3%" : "-2%",
      trendUp: reportData.summary.passRate >= 80,
      Icon: IconShieldCheck,
      accent: "text-status-pass",
      glow: "from-status-pass/20",
    },
    {
      label: "Risk Trend",
      value: reportData.summary.riskTrend,
      sub: riskTrendMeta.sub,
      trend: riskTrendMeta.trend,
      trendUp: riskTrendMeta.trendUp,
      Icon: IconTrendingUp,
      accent: trendStyles[reportData.summary.riskTrend] ?? "text-status-warn",
      glow:
        reportData.summary.riskTrend === "improving"
          ? "from-status-pass/20"
          : reportData.summary.riskTrend === "degrading"
            ? "from-status-fail/20"
            : "from-status-warn/20",
      capitalize: true,
    },
    {
      label: "EU AI Act Score",
      value: `${euScore}%`,
      sub: euScore >= 80 ? "Compliant" : euScore >= 50 ? "Partial compliance" : "Non-compliant",
      trend:
        euScore >= 80 ? "Compliant" : euScore >= 50 ? "Partial" : "Action needed",
      trendUp: euScore >= 80,
      Icon: IconShield,
      accent: euScoreText,
      glow:
        euScore >= 80
          ? "from-status-pass/20"
          : euScore >= 50
            ? "from-status-warn/20"
            : "from-status-fail/20",
    },
  ];

  // Compute max count for top findings bar chart
  const maxFindingCount = Math.max(
    ...reportData.summary.topFindings.map((f: { count: number }) => f.count),
    1,
  );

  const findingBarColors = [
    "bg-accent",
    "bg-status-warn",
    "bg-status-fail",
    "bg-status-pass",
    "bg-status-running",
  ];

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_CARDS.map((card) => {
            const { Icon, accent, glow } = card;
            return (
              <div
                key={card.label}
                className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-5"
              >
                {/* Subtle gradient glow on hover */}
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
                  <p
                    className={`mt-2 text-3xl font-bold tracking-tight ${
                      card.capitalize ? trendStyles[reportData.summary.riskTrend] : "text-text-primary"
                    } ${card.capitalize ? "capitalize" : ""}`}
                  >
                    {card.value}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[10px] text-text-tertiary">{card.sub}</p>
                    <span
                      className={`text-[10px] font-semibold ${
                        card.trendUp ? "text-status-pass" : "text-status-warn"
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

      {/* EU AI Act compliance score progress bar */}
      <section aria-label="EU AI Act compliance score" className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 ${euScoreText}`}>
                <IconShield className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">EU AI Act Compliance Score</h2>
                <p className="mt-0.5 text-[11px] text-text-tertiary">
                  Overall compliance across all assessed articles
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold tracking-tight ${euScoreText}`}>{euScore}%</p>
              <p className="text-[10px] text-text-tertiary">
                {euScore >= 80 ? "Compliant" : euScore >= 50 ? "Partial" : "Non-compliant"}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${euScoreColor} transition-all duration-700`}
                style={{ width: `${euScore}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-text-tertiary">
              <span>0%</span>
              <span className="text-status-warn">50%</span>
              <span className="text-status-pass">80%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </section>

      {/* EU AI Act */}
      <section aria-label="EU AI Act compliance" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-4 text-sm font-semibold text-text-primary">EU AI Act Compliance</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
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
              <tr className="border-b border-border bg-surface-2/50">
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
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        ctrl.status === "met"
                          ? "bg-status-pass"
                          : ctrl.status === "partial"
                            ? "bg-status-warn"
                            : "bg-status-fail"
                      }`} />
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
          <div className="mb-4 flex items-center gap-2">
            <IconBarChart className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Top Finding Categories</h2>
          </div>
          <div className="space-y-2">
            {reportData.summary.topFindings.map((f, i: number) => {
              const barWidth = Math.max((f.count / maxFindingCount) * 100, 4);
              const barColor = findingBarColors[i % findingBarColors.length];
              return (
                <div
                  key={f.category}
                  className="group relative overflow-hidden rounded-xl border border-border bg-surface-1 px-5 py-3.5"
                >
                  {/* Background proportion bar */}
                  <div
                    className={`absolute inset-y-0 left-0 ${barColor} opacity-[0.08] transition-all duration-500 group-hover:opacity-[0.15]`}
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-2.5 w-2.5 rounded-full ${barColor}`}
                      />
                      <span className="text-[13px] capitalize text-text-secondary">
                        {f.category.replace(/-/g, " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Inline mini bar */}
                      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-surface-3 sm:block">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="min-w-[2rem] text-right font-mono text-sm font-bold text-text-primary">
                        {f.count}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
