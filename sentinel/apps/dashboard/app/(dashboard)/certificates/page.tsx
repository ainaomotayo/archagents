import { getCertificates } from "@/lib/api";
import { CertificateBadge } from "@/components/certificate-badge";
import { PageHeader } from "@/components/page-header";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CertificatesPage() {
  const certificates = await getCertificates();

  const activeCount = certificates.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description={`${activeCount} active trust certificates across monitored commits.`}
      />

      <div className="animate-fade-up overflow-hidden rounded-xl border border-border bg-surface-1" style={{ animationDelay: "0.05s" }}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">ID</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Issued</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {certificates.map((cert) => (
              <tr key={cert.id} className="table-row-hover transition-colors">
                <td className="px-5 py-3.5 font-mono text-xs text-accent">{cert.id}</td>
                <td className="px-5 py-3.5">
                  <CertificateBadge status={cert.status} />
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">{cert.commit}</td>
                <td className="px-5 py-3.5 text-text-secondary">{cert.branch}</td>
                <td className="px-5 py-3.5">
                  <span className={
                    cert.riskScore >= 50
                      ? "font-semibold text-status-fail"
                      : cert.riskScore >= 25
                        ? "font-semibold text-status-warn"
                        : "text-text-secondary"
                  }>
                    {cert.riskScore}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-text-tertiary">
                  {formatDate(cert.issuedAt)}
                </td>
                <td className="px-5 py-3.5 text-xs text-text-tertiary">
                  {formatDate(cert.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
