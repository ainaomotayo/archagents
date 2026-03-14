import { getDecisionTrace } from "@/lib/api";
import { SignalBar } from "@/components/signal-bar";

interface DecisionTraceCardProps {
  findingId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function DecisionTraceCard({ findingId }: DecisionTraceCardProps) {
  const trace = await getDecisionTrace(findingId);
  if (!trace) return null;

  const signalEntries = Object.entries(trace.signals)
    .sort(([, a], [, b]) => b.contribution - a.contribution);

  return (
    <section
      aria-label="AI Decision Trace"
      className="animate-fade-up"
      style={{ animationDelay: "0.08s" }}
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        AI Decision Trace
      </h2>
      <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-5">
        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Tool
            </p>
            <p className="mt-1 text-[12px] text-text-secondary">
              {trace.toolName ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Model
            </p>
            <p className="mt-1 text-[12px] text-text-secondary">
              {trace.modelVersion ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Category
            </p>
            <p className="mt-1 text-[12px] capitalize text-text-secondary">
              {trace.promptCategory?.replace(/-/g, " ") ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Overall Score
            </p>
            <p className="mt-1 text-[12px] font-bold text-text-primary">
              {(trace.overallScore * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Signal bars */}
        {signalEntries.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Signal Contributions
            </p>
            <div className="space-y-2">
              {signalEntries.map(([name, sig]) => (
                <SignalBar
                  key={name}
                  name={name}
                  weight={sig.weight}
                  probability={sig.probability}
                  contribution={sig.contribution}
                  overallScore={trace.overallScore}
                />
              ))}
            </div>
          </div>
        )}

        {/* Enrichment */}
        {trace.declaredTool && (
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Pre-declared Metadata
            </p>
            <div className="flex flex-wrap gap-4 text-[12px] text-text-secondary">
              <span>
                Declared tool: <strong>{trace.declaredTool}</strong>
              </span>
              {trace.declaredModel && (
                <span>
                  Declared model: <strong>{trace.declaredModel}</strong>
                </span>
              )}
              {trace.enrichedAt && (
                <span className="text-text-tertiary">
                  Enriched {formatDate(trace.enrichedAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
