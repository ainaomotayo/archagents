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
      <div className="flex h-64 items-center justify-center">
        <p className="text-text-tertiary">Finding not found.</p>
      </div>
    );
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
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-text-primary">{finding.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <SeverityBadge severity={finding.severity} />
          <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            Confidence: {finding.confidence}%
          </span>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-medium capitalize text-text-tertiary">
            {finding.category.replace(/-/g, " ")}
          </span>
          <span className="text-[11px] capitalize text-text-tertiary">
            Status: {finding.status}
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

      {/* Code snippet */}
      <section aria-label="Code snippet" className="animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Affected Code</h2>
        <div className="rounded-xl border border-border bg-surface-0 p-5">
          <p className="mb-3 font-mono text-[11px] text-text-tertiary">
            {finding.filePath} (lines {finding.lineStart}
            {finding.lineEnd !== finding.lineStart ? `\u2013${finding.lineEnd}` : ""})
          </p>
          <pre className="overflow-x-auto font-mono text-[13px] leading-relaxed">
            <code className="text-status-warn">{finding.codeSnippet}</code>
          </pre>
        </div>
      </section>

      {/* Remediation */}
      <section aria-label="Remediation" className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Remediation</h2>
        <div className="rounded-xl border border-border-accent bg-accent-subtle p-5">
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
            className="rounded-lg border border-status-warn/30 bg-status-warn/10 px-4 py-2.5 text-[13px] font-semibold text-status-warn transition-all hover:bg-status-warn/20 focus-ring"
            aria-label="Suppress this finding"
          >
            Suppress
          </button>
          <button
            type="button"
            className="rounded-lg border border-status-pass/30 bg-status-pass/10 px-4 py-2.5 text-[13px] font-semibold text-status-pass transition-all hover:bg-status-pass/20 focus-ring"
            aria-label="Mark this finding as resolved"
          >
            Resolve
          </button>
        </div>
      </section>
    </div>
  );
}
