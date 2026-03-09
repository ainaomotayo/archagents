import Link from "next/link";
import { getFindingById } from "@/lib/api";
import { SeverityBadge } from "@/components/severity-badge";
import { PageHeader } from "@/components/page-header";
import { IconChevronLeft } from "@/components/icons";

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
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-1">
          <svg
            className="h-7 w-7 text-text-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">Finding not found</p>
          <p className="mt-1 text-[13px] text-text-tertiary">
            The requested finding could not be located or may have been removed.
          </p>
        </div>
        <Link
          href="/findings"
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary focus-ring"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Back to Findings
        </Link>
      </div>
    );
  }

  const lineNumbers: number[] = [];
  for (let i = finding.lineStart; i <= finding.lineEnd; i++) {
    lineNumbers.push(i);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-up">
        <Link
          href="/findings"
          className="inline-flex items-center gap-1 text-[13px] text-text-tertiary hover:text-accent transition-colors focus-ring rounded"
          aria-label="Back to findings"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Findings
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight text-text-primary">{finding.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={finding.severity} />
          <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-secondary">
            Confidence: {finding.confidence}%
          </span>
          <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary">
            {finding.category.replace(/-/g, " ")}
          </span>
          <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium capitalize text-text-secondary">
            {finding.status}
          </span>
        </div>
      </div>

      {/* Description */}
      <section aria-label="Description" className="animate-fade-up" style={{ animationDelay: "0.05s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Description</h2>
        <p className="text-[13px] leading-relaxed text-text-secondary">
          {finding.description}
        </p>
      </section>

      {/* Metadata card */}
      <section aria-label="Metadata" className="animate-fade-up" style={{ animationDelay: "0.07s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Details</h2>
        <div className="rounded-xl border border-border bg-surface-1 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">File Path</p>
              <p className="mt-1 truncate font-mono text-[12px] text-text-secondary" title={finding.filePath}>
                {finding.filePath}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Line Range</p>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">
                {finding.lineStart}
                {finding.lineEnd !== finding.lineStart ? `\u2013${finding.lineEnd}` : ""}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Category</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">
                {finding.category.replace(/-/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Confidence</p>
              <p className="mt-1 text-[12px] text-text-secondary">{finding.confidence}%</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</p>
              <p className="mt-1 text-[12px] capitalize text-text-secondary">{finding.status}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Code snippet */}
      <section aria-label="Code snippet" className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Affected Code</h2>
        <div className="relative overflow-hidden rounded-xl border border-border bg-surface-1">
          <p className="border-b border-border px-5 py-3 font-mono text-[11px] text-text-tertiary">
            {finding.filePath} (lines {finding.lineStart}
            {finding.lineEnd !== finding.lineStart ? `\u2013${finding.lineEnd}` : ""})
          </p>
          <div className="relative">
            {/* Top gradient overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-surface-1 to-transparent" />
            {/* Bottom gradient overlay */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-surface-1 to-transparent" />
            <div className="overflow-x-auto py-4">
              <table className="w-full border-collapse">
                <tbody>
                  {finding.codeSnippet.split("\n").map((line: string, index: number) => (
                    <tr key={index} className="hover:bg-white/[0.02]">
                      <td className="w-12 select-none pr-4 text-right align-top font-mono text-[12px] leading-relaxed text-text-tertiary/50">
                        {lineNumbers[index] ?? finding.lineStart + index}
                      </td>
                      <td className="pl-4 font-mono text-[13px] leading-relaxed">
                        <code className="text-status-warn whitespace-pre">{line}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Remediation */}
      <section aria-label="Remediation" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Remediation</h2>
        <div className="rounded-xl border border-border bg-accent-subtle/40 p-5 border-l-[3px] border-l-accent">
          <p className="text-[13px] leading-relaxed text-text-secondary">
            {finding.remediation}
          </p>
        </div>
      </section>

      {/* Actions */}
      <section aria-label="Actions" className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Actions</h2>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-lg border border-status-warn/30 bg-status-warn/10 px-4 py-2.5 text-[13px] font-semibold text-status-warn transition-all hover:bg-status-warn/20 active:scale-[0.98] focus-ring"
            aria-label="Suppress this finding"
          >
            Suppress
          </button>
          <button
            type="button"
            className="rounded-lg border border-status-pass/30 bg-status-pass/10 px-4 py-2.5 text-[13px] font-semibold text-status-pass transition-all hover:bg-status-pass/20 active:scale-[0.98] focus-ring"
            aria-label="Mark this finding as resolved"
          >
            Resolve
          </button>
        </div>
      </section>
    </div>
  );
}
