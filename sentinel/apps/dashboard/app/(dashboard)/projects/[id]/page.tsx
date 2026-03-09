import Link from "next/link";
import {
  getProjectById,
  getProjectScans,
  getProjectFindingCounts,
  getProjectCertificate,
} from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { CertificateBadge } from "@/components/certificate-badge";
import { PageHeader } from "@/components/page-header";
import { IconChevronLeft } from "@/components/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  const [project, scans, findingCounts, certificate] = await Promise.all([
    getProjectById(id),
    getProjectScans(id),
    getProjectFindingCounts(id),
    getProjectCertificate(id),
  ]);

  if (!project) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-text-tertiary">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-up">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
          aria-label="Back to projects"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Projects
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">{project.name}</h1>
        <p className="mt-1 font-mono text-[11px] text-text-tertiary">{project.repoUrl}</p>
      </div>

      {/* Certificate status */}
      <section aria-label="Certificate status" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Certificate Status</h2>
        {certificate ? (
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <div className="flex items-center gap-4 flex-wrap">
              <CertificateBadge status={certificate.status} />
              <span className="text-[13px] text-text-secondary">
                Risk Score: <span className="font-semibold text-text-primary">{certificate.riskScore}</span>
              </span>
              <span className="text-xs text-text-tertiary">
                Issued {formatDate(certificate.issuedAt)}
              </span>
              <span className="text-xs text-text-tertiary">
                Expires {formatDate(certificate.expiresAt)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-text-tertiary">
            No active certificate for this project.
          </p>
        )}
      </section>

      {/* Finding counts by category */}
      <section aria-label="Findings by category" className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Findings by Category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {findingCounts.map((fc) => (
            <div
              key={fc.category}
              className="stat-card rounded-xl border border-border bg-surface-1 p-4 text-center"
            >
              <p className="text-2xl font-bold text-text-primary">{fc.count}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider capitalize text-text-tertiary">
                {fc.category.replace(/-/g, " ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Scan history */}
      <section aria-label="Scan history" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Scan History</h2>
        {scans.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">No scans recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2">
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Findings</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {scans.map((scan) => (
                  <tr key={scan.id} className="table-row-hover transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-accent">{scan.commit}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{scan.branch}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={scan.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={
                        scan.riskScore >= 50
                          ? "font-semibold text-status-fail"
                          : scan.riskScore >= 25
                            ? "font-semibold text-status-warn"
                            : "text-text-secondary"
                      }>
                        {scan.riskScore}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-text-secondary">{scan.findingCount}</td>
                    <td className="px-5 py-3.5 text-xs text-text-tertiary">
                      {formatDate(scan.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
