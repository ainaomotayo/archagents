import Link from "next/link";
import { getProjects } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { IconFolder, IconExternalLink } from "@/components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  const activeCount = projects.filter((p) => p.lastScanStatus).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description={`${projects.length} monitored repositories \u00B7 ${activeCount} with recent scans`}
      />

      {projects.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
          <div className="text-center">
            <IconFolder className="mx-auto h-8 w-8 text-text-tertiary" />
            <p className="mt-3 text-[14px] font-semibold text-text-primary">
              No projects yet
            </p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              Submit your first scan to create a project.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project, i) => (
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
                  {project.lastScanStatus && (
                    <StatusBadge status={project.lastScanStatus} />
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
          ))}
        </div>
      )}
    </div>
  );
}
