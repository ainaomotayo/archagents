import { getCertificates } from "@/lib/api";
import { CertificateBadge } from "@/components/certificate-badge";
import { PageHeader } from "@/components/page-header";
import {
  IconShieldCheck,
  IconShield,
  IconAlertTriangle,
  IconXCircle,
  IconClock,
} from "@/components/icons";
import { EmptyState } from "@/components/empty-state";

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
  const revokedCount = certificates.filter((c) => c.status === "revoked").length;
  const expiredCount = certificates.filter((c) => c.status === "expired").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description={`${activeCount} active trust certificates across monitored commits.`}
      />

      {/* Status summary strip */}
      <div
        className="animate-fade-up flex gap-2"
        style={{ animationDelay: "0.03s" }}
      >
        {(
          [
            ["active", "bg-status-pass", "border-status-pass/30", IconShieldCheck, activeCount],
            ["revoked", "bg-status-fail", "border-status-fail/30", IconXCircle, revokedCount],
            ["expired", "bg-text-tertiary", "border-border", IconClock, expiredCount],
          ] as const
        ).map(([label, bg, border, Icon, count]) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-lg border ${border} bg-surface-1 px-3 py-2`}
          >
            <Icon className="h-3.5 w-3.5 text-text-tertiary" />
            <span className={`h-2 w-2 rounded-full ${bg}`} />
            <span className="text-[11px] font-semibold capitalize text-text-secondary">
              {label}
            </span>
            <span className="font-mono text-[13px] font-bold text-text-primary">
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Certificates table or empty state */}
      {certificates.length === 0 ? (
        <EmptyState
          icon={IconShield}
          headline="No certificates issued yet"
          body="Certificates are issued automatically when scans pass all compliance thresholds."
          cta={{ label: "Run your first scan", href: "/projects" }}
        />
      ) : (
        <div
          className="animate-fade-up overflow-hidden rounded-xl border border-border bg-surface-1"
          style={{ animationDelay: "0.05s" }}
        >
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">ID</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Status</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Commit</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Branch</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Risk Score</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Issued</th>
                <th scope="col" className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {certificates.map((cert, i) => (
                <tr
                  key={cert.id}
                  className="animate-fade-up table-row-hover transition-colors"
                  style={{ animationDelay: `${0.06 + 0.04 * i}s` }}
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-accent">{cert.id}</td>
                  <td className="px-5 py-3.5">
                    <CertificateBadge status={cert.status} />
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-text-secondary">{cert.commit}</td>
                  <td className="px-5 py-3.5 text-text-secondary">{cert.branch}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                        <div
                          className={`h-full rounded-full transition-all ${
                            cert.riskScore >= 50
                              ? "bg-status-fail"
                              : cert.riskScore >= 25
                                ? "bg-status-warn"
                                : "bg-status-pass"
                          }`}
                          style={{ width: `${cert.riskScore}%` }}
                        />
                      </div>
                      <span
                        className={`font-mono text-xs ${
                          cert.riskScore >= 50
                            ? "text-status-fail"
                            : cert.riskScore >= 25
                              ? "text-status-warn"
                              : "text-text-secondary"
                        }`}
                      >
                        {cert.riskScore}
                      </span>
                    </div>
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
      )}
    </div>
  );
}
