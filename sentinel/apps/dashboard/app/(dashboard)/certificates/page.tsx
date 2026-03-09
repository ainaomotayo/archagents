import { getCertificates } from "@/lib/api";
import { CertificateBadge } from "@/components/certificate-badge";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Certificates</h1>
        <p className="mt-1 text-slate-400">
          Trust certificates issued for scanned commits.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">ID</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Commit</th>
              <th scope="col" className="px-4 py-3">Branch</th>
              <th scope="col" className="px-4 py-3">Risk Score</th>
              <th scope="col" className="px-4 py-3">Issued</th>
              <th scope="col" className="px-4 py-3">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {certificates.map((cert) => (
              <tr
                key={cert.id}
                className="bg-slate-950 text-slate-300"
                aria-label={`Certificate ${cert.id}`}
              >
                <td className="px-4 py-3 font-mono text-xs">{cert.id}</td>
                <td className="px-4 py-3">
                  <CertificateBadge status={cert.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{cert.commit}</td>
                <td className="px-4 py-3">{cert.branch}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      cert.riskScore >= 50
                        ? "text-red-400"
                        : cert.riskScore >= 25
                          ? "text-yellow-400"
                          : "text-green-400"
                    }
                  >
                    {cert.riskScore}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {formatDate(cert.issuedAt)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
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
