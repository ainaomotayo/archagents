import Link from "next/link";
import { getProjects } from "@/lib/api";
import type { ScanStatus } from "@/lib/types";

const STATUS_STYLES: Record<ScanStatus, string> = {
  pass: "bg-green-900/50 text-green-300 border-green-700",
  fail: "bg-red-900/50 text-red-300 border-red-700",
  provisional: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
  running: "bg-blue-900/50 text-blue-300 border-blue-700",
};

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
      <div>
        <h1 className="text-3xl font-bold text-white">Projects</h1>
        <p className="mt-1 text-slate-400">
          All monitored repositories and their scan status.
        </p>
      </div>

      <div className="grid gap-4">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/dashboard/projects/${project.id}`}
            className="block rounded-lg border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-slate-700 hover:bg-slate-800/50"
            aria-label={`View project ${project.name}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {project.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {project.lastScanDate
                    ? `Last scan: ${formatDate(project.lastScanDate)}`
                    : "No scans yet"}
                </p>
              </div>

              <div className="flex items-center gap-4">
                {project.lastScanStatus && (
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[project.lastScanStatus]}`}
                  >
                    {project.lastScanStatus}
                  </span>
                )}
                <div className="text-right">
                  <p className="text-sm font-medium text-white">
                    {project.findingCount}
                  </p>
                  <p className="text-xs text-slate-500">findings</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">
                    {project.scanCount}
                  </p>
                  <p className="text-xs text-slate-500">scans</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
