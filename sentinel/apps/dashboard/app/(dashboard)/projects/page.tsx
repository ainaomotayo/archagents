import Link from "next/link";
import { getProjects, getRiskTrends } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { IconFolder, IconExternalLink } from "@/components/icons";
import { RiskSparkline } from "@/components/risk-sparkline";
import { RiskTrendBadge } from "@/components/risk-trend-badge";
import { EmptyState } from "@/components/empty-state";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const [projects, riskTrendData] = await Promise.all([
    getProjects(),
    getRiskTrends(90),
  ]);

  const activeCount = projects.filter((p) => p.lastScanStatus).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={`${projects.length} monitored repositories \u00B7 ${activeCount} with recent scans`}
        action={
          <Link
            href="/settings/vcs"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-white transition-all hover:brightness-110 focus-ring"
          >
            Connect repository <span aria-hidden>+</span>
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={IconFolder}
          headline="No repositories monitored yet"
          body="Connect a repository via your VCS integration to start scanning."
          cta={{ label: "Go to Integrations", href: "/settings/vcs" }}
        />
      ) : (
        <div className="grid gap-3">
          {projects.map((project, i) => {
            const trend = riskTrendData.trends[project.id];
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="animate-fade-up group block rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2 focus-ring"
                style={{ animationDelay: `${0.04 * i}s` }}
                aria-label={`View project ${project.name}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 transition-colors group-hover:bg-surface-3">
                      <IconFolder className="h-4 w-4 text-text-tertiary group-hover:text-accent transition-colors" />
                    </div>
                    <div>
                      <h2 className="text-[14px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                        {project.name}
                      </h2>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-text-tertiary">
                        {project.repoUrl ? (
                          <>
                            <span className="truncate max-w-[200px]">
                              {project.repoUrl.replace(/^https?:\/\//, "")}
                            </span>
                            <IconExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                          </>
                        ) : (
                          project.lastScanDate
                            ? `Last scan: ${formatDate(project.lastScanDate)}`
                            : "No scans yet"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-5">
                    {trend && (
                      <div className="flex items-center gap-2">
                        <RiskSparkline
                          points={trend.points}
                          direction={trend.direction}
                        />
                        <RiskTrendBadge
                          direction={trend.direction}
                          changePercent={trend.changePercent}
                        />
                      </div>
                    )}
                    {project.lastScanStatus && (
                      <StatusBadge status={project.lastScanStatus} />
                    )}
                    {(() => {
                      const { status, findings } = { status: project.lastScanStatus, findings: project.findingCount };
                      if (!status) return null;
                      const chip =
                        status === "fail" || findings >= 10
                          ? { label: "Critical", cls: "text-status-fail bg-status-fail/10" }
                          : status === "provisional" || findings >= 3
                            ? { label: "At Risk", cls: "text-status-warn bg-status-warn/10" }
                            : { label: "Healthy", cls: "text-status-pass bg-status-pass/10" };
                      return (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}>
                          {chip.label}
                        </span>
                      );
                    })()}
                    {project.lastScanDate && Date.now() - new Date(project.lastScanDate).getTime() > 7 * 24 * 60 * 60 * 1000 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-status-warn bg-status-warn/10">
                        Scan overdue
                      </span>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-text-primary">
                          {project.findingCount}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-text-tertiary">
                          findings
                        </p>
                      </div>
                      <div className="h-6 w-px bg-border" />
                      <div className="text-right">
                        <p className="text-lg font-bold text-text-primary">
                          {project.scanCount}
                        </p>
                        <p className="text-[9px] uppercase tracking-wider text-text-tertiary">
                          scans
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
