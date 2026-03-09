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

function riskColor(score: number): string {
  if (score >= 50) return "bg-status-fail";
  if (score >= 25) return "bg-status-warn";
  return "bg-emerald-500";
}

function riskTextColor(score: number): string {
  if (score >= 50) return "text-status-fail";
  if (score >= 25) return "text-status-warn";
  return "text-text-secondary";
}

function countIndicatorColor(count: number): string {
  if (count > 10) return "bg-red-500";
  if (count > 5) return "bg-yellow-500";
  return "bg-emerald-500";
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
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface-1 px-12 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-accent bg-accent-subtle">
            <svg
              className="h-6 w-6 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Project not found</p>
            <p className="mt-1 text-[13px] text-text-tertiary">
              The project you are looking for does not exist or has been removed.
            </p>
          </div>
          <Link
            href="/projects"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:border-border-accent hover:text-accent"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            Back to Projects
          </Link>
        </div>
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
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">{project.name}</h1>
        <a
          href={project.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-accent hover:text-accent/80 transition-colors"
        >
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-1.242-7.244l4.5-4.5a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757" />
          </svg>
          {project.repoUrl}
        </a>
      </div>

      {/* Certificate status */}
      <section
        aria-label="Certificate status"
        className="animate-fade-up"
        style={{ animationDelay: "0.05s" }}
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Certificate Status</h2>
        {certificate ? (
          <div
            className={`rounded-xl border p-5 bg-surface-1 transition-all ${
              certificate.status === "active"
                ? "border-border-accent shadow-[0_0_20px_-6px] shadow-accent/10"
                : "border-border"
            }`}
          >
            <div className="flex items-center gap-4 flex-wrap">
              <CertificateBadge status={certificate.status} />
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-text-secondary">
                  Risk Score: <span className={`font-semibold ${riskTextColor(certificate.riskScore)}`}>{certificate.riskScore}</span>
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full transition-all ${riskColor(certificate.riskScore)}`}
                      style={{ width: `${Math.min(certificate.riskScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-tertiary">{certificate.riskScore}/100</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-6 border-t border-border-subtle pt-3">
              <span className="text-xs text-text-tertiary">
                Issued {formatDate(certificate.issuedAt)}
              </span>
              <span className="text-xs text-text-tertiary">
                Expires {formatDate(certificate.expiresAt)}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-1 p-5">
            <p className="text-[13px] text-text-tertiary">
              No active certificate for this project.
            </p>
          </div>
        )}
      </section>

      {/* Finding counts by category */}
      <section
        aria-label="Findings by category"
        className="animate-fade-up"
        style={{ animationDelay: "0.1s" }}
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Findings by Category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {findingCounts.map((fc, i) => (
            <div
              key={fc.category}
              className="stat-card group relative overflow-hidden rounded-xl border border-border bg-surface-1 p-4 text-center animate-fade-up"
              style={{ animationDelay: `${0.12 + i * 0.04}s` }}
            >
              <div className="flex items-center justify-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${countIndicatorColor(fc.count)}`} />
                <p className="text-2xl font-bold text-text-primary">{fc.count}</p>
              </div>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-wider capitalize text-text-tertiary">
                {fc.category.replace(/-/g, " ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Scan history */}
      <section
        aria-label="Scan history"
        className="animate-fade-up"
        style={{ animationDelay: "0.2s" }}
      >
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Scan History</h2>
        {scans.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-1 p-8 text-center">
            <p className="text-[13px] text-text-tertiary">No scans recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-2/50">
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Findings</th>
                  <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {scans.map((scan, i) => (
                  <tr
                    key={scan.id}
                    className="table-row-hover transition-colors animate-fade-up"
                    style={{ animationDelay: `${0.22 + i * 0.03}s` }}
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-accent">{scan.commit}</td>
                    <td className="px-5 py-3.5 text-text-secondary">{scan.branch}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={scan.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${riskTextColor(scan.riskScore)}`}>
                          {scan.riskScore}
                        </span>
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full rounded-full ${riskColor(scan.riskScore)}`}
                            style={{ width: `${Math.min(scan.riskScore, 100)}%` }}
                          />
                        </div>
                      </div>
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
