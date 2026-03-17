import { getIPAttributionCertificate } from "@/lib/api";
import { ProvenanceBar } from "@/components/provenance-bar";

interface IPAttributionCardProps {
  scanId: string;
}

export async function IPAttributionCard({ scanId }: IPAttributionCardProps) {
  const cert = await getIPAttributionCertificate(scanId);
  if (!cert) return null;

  return (
    <section
      aria-label="IP Attribution"
      className="animate-fade-up"
      style={{ animationDelay: "0.12s" }}
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        IP Attribution
      </h2>
      <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-5">
        {/* Summary row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Total Files
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {cert.summary.totalFiles}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              AI Ratio
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {(cert.summary.overallAiRatio * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Avg Confidence
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {(cert.summary.avgConfidence * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Conflicts
            </p>
            <p className="mt-1 text-lg font-semibold text-text-primary">
              {cert.summary.conflictingFiles}
            </p>
          </div>
        </div>

        {/* Provenance bar */}
        <ProvenanceBar classifications={cert.summary.classifications} />

        {/* Tool breakdown */}
        {cert.toolBreakdown.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Tool Attribution
            </p>
            <div className="space-y-1">
              {cert.toolBreakdown.map((t) => (
                <div key={t.tool} className="flex items-center justify-between text-[12px]">
                  <span className="text-text-secondary">
                    {t.tool}{t.model ? ` (${t.model})` : ""}
                  </span>
                  <span className="tabular-nums text-text-tertiary">
                    {t.files} files · {t.loc} LOC · {(t.percentage * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certificate info */}
        <div className="flex items-center justify-between border-t border-border pt-3 text-[10px] text-text-tertiary">
          <span>Certificate: {cert.id.slice(0, 20)}...</span>
          <span>Signed: {cert.signature.slice(0, 12)}...</span>
        </div>
      </div>
    </section>
  );
}
