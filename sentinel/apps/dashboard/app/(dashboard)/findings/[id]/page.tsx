import Link from "next/link";
import { getFindingById } from "@/lib/api";
import { SeverityBadge } from "@/components/severity-badge";

// TODO: Integrate real-time scan status updates.
// When this page is converted to a client component (or a client wrapper is
// added), use the useScanStatus hook to show live progress:
//
//   import { useScanStatus } from "@/lib/use-scan-status";
//   const { status, connected, error } = useScanStatus(finding.scanId);
//
// Then render a <ScanProgressBar status={status} /> component in the header
// section to display real-time agent progress during an active scan.

interface FindingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function FindingDetailPage({
  params,
}: FindingDetailPageProps) {
  const { id } = await params;
  const finding = await getFindingById(id);

  if (!finding) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-slate-400">Finding not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/findings"
          className="text-sm text-slate-400 hover:text-slate-200"
          aria-label="Back to findings"
        >
          &larr; Findings
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">{finding.title}</h1>
        <div className="mt-2 flex items-center gap-3">
          <SeverityBadge severity={finding.severity} />
          <span
            className="inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300"
            aria-label={`Confidence: ${finding.confidence}%`}
          >
            Confidence: {finding.confidence}%
          </span>
          <span className="text-xs capitalize text-slate-500">
            {finding.category}
          </span>
          <span className="text-xs capitalize text-slate-500">
            Status: {finding.status}
          </span>
        </div>
      </div>

      {/* Description */}
      <section aria-label="Description">
        <h2 className="mb-2 text-lg font-semibold text-white">Description</h2>
        <p className="text-sm leading-relaxed text-slate-300">
          {finding.description}
        </p>
      </section>

      {/* Code snippet */}
      <section aria-label="Code snippet">
        <h2 className="mb-2 text-lg font-semibold text-white">
          Affected Code
        </h2>
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <p className="mb-2 text-xs text-slate-500">
            {finding.filePath} (lines {finding.lineStart}
            {finding.lineEnd !== finding.lineStart
              ? `–${finding.lineEnd}`
              : ""}
            )
          </p>
          <pre className="overflow-x-auto text-sm">
            <code className="text-amber-300">{finding.codeSnippet}</code>
          </pre>
        </div>
      </section>

      {/* Remediation */}
      <section aria-label="Remediation">
        <h2 className="mb-2 text-lg font-semibold text-white">Remediation</h2>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm leading-relaxed text-slate-300">
            {finding.remediation}
          </p>
        </div>
      </section>

      {/* Actions */}
      <section aria-label="Actions">
        <h2 className="mb-3 text-lg font-semibold text-white">Actions</h2>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-lg border border-yellow-700 bg-yellow-900/30 px-4 py-2 text-sm font-medium text-yellow-300 transition-colors hover:bg-yellow-900/50"
            aria-label="Suppress this finding"
          >
            Suppress
          </button>
          <button
            type="button"
            className="rounded-lg border border-green-700 bg-green-900/30 px-4 py-2 text-sm font-medium text-green-300 transition-colors hover:bg-green-900/50"
            aria-label="Mark this finding as resolved"
          >
            Resolve
          </button>
        </div>
      </section>
    </div>
  );
}
