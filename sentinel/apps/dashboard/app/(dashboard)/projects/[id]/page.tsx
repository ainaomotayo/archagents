import Link from "next/link";
import {
  getProjectById,
  getProjectScans,
  getProjectFindingCounts,
  getProjectCertificate,
} from "@/lib/api";
import type { ScanStatus, CertificateStatus } from "@/lib/types";

const SCAN_STATUS_STYLES: Record<ScanStatus, string> = {
  pass: "bg-green-900/50 text-green-300",
  fail: "bg-red-900/50 text-red-300",
  provisional: "bg-yellow-900/50 text-yellow-300",
  running: "bg-blue-900/50 text-blue-300",
};

const CERT_STATUS_STYLES: Record<CertificateStatus, string> = {
  active: "bg-green-900/50 text-green-300 border-green-700",
  revoked: "bg-red-900/50 text-red-300 border-red-700",
  expired: "bg-slate-800 text-slate-400 border-slate-600",
};

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
        <p className="text-slate-400">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/projects"
          className="text-sm text-slate-400 hover:text-slate-200"
          aria-label="Back to projects"
        >
          &larr; Projects
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-white">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">{project.repoUrl}</p>
      </div>

      {/* Certificate status */}
      <section aria-label="Certificate status">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Certificate Status
        </h2>
        {certificate ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-4">
              <span
                className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${CERT_STATUS_STYLES[certificate.status]}`}
              >
                {certificate.status}
              </span>
              <span className="text-sm text-slate-300">
                Risk Score: {certificate.riskScore}
              </span>
              <span className="text-xs text-slate-500">
                Issued {formatDate(certificate.issuedAt)}
              </span>
              <span className="text-xs text-slate-500">
                Expires {formatDate(certificate.expiresAt)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No active certificate for this project.
          </p>
        )}
      </section>

      {/* Finding counts by category */}
      <section aria-label="Findings by category">
        <h2 className="mb-3 text-lg font-semibold text-white">
          Findings by Category
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {findingCounts.map((fc) => (
            <div
              key={fc.category}
              className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-center"
            >
              <p className="text-2xl font-bold text-white">{fc.count}</p>
              <p className="mt-1 text-xs capitalize text-slate-400">
                {fc.category}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Scan history */}
      <section aria-label="Scan history">
        <h2 className="mb-3 text-lg font-semibold text-white">Scan History</h2>
        {scans.length === 0 ? (
          <p className="text-sm text-slate-500">No scans recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">Commit</th>
                  <th scope="col" className="px-4 py-3">Branch</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Risk</th>
                  <th scope="col" className="px-4 py-3">Findings</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {scans.map((scan) => (
                  <tr key={scan.id} className="bg-slate-950 text-slate-300">
                    <td className="px-4 py-3 font-mono text-xs">
                      {scan.commit}
                    </td>
                    <td className="px-4 py-3">{scan.branch}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCAN_STATUS_STYLES[scan.status]}`}
                      >
                        {scan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{scan.riskScore}</td>
                    <td className="px-4 py-3">{scan.findingCount}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
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
