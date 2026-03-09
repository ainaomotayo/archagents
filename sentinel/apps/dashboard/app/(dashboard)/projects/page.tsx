import Link from "next/link";
import { getProjects } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="All monitored repositories and their compliance status."
      />

      <div className="grid gap-3">
        {projects.map((project, i) => (
          <Link
            key={project.id}
            href={`/dashboard/projects/${project.id}`}
            className="animate-fade-up group block rounded-xl border border-border bg-surface-1 p-5 transition-all duration-150 hover:border-border-accent hover:bg-surface-2 focus-ring"
            style={{ animationDelay: `${0.05 * i}s` }}
            aria-label={`View project ${project.name}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary group-hover:text-accent transition-colors">
                  {project.name}
                </h2>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  {project.lastScanDate
                    ? `Last scan: ${formatDate(project.lastScanDate)}`
                    : "No scans yet"}
                </p>
              </div>

              <div className="flex items-center gap-6">
                {project.lastScanStatus && (
                  <StatusBadge status={project.lastScanStatus} />
                )}
                <div className="text-right">
                  <p className="text-lg font-bold text-text-primary">
                    {project.findingCount}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">findings</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-text-primary">
                    {project.scanCount}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-text-tertiary">scans</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
