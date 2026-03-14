export interface TraceSignalDetail {
  weight: number;
  rawValue: number;
  probability: number;
  contribution: number;
  detail: Record<string, unknown>;
}

export type TraceSignals = Record<string, TraceSignalDetail>;

export interface ExtractedTrace {
  toolName: string | null;
  promptHash: string | null;
  promptCategory: string | null;
  overallScore: number;
  signals: TraceSignals;
}

/**
 * Extract a structured trace from a finding's rawData.
 * Returns null if the finding has no trace data (non-AI findings).
 */
export function extractTrace(rawData: unknown): ExtractedTrace | null {
  if (!rawData || typeof rawData !== "object") return null;
  const data = rawData as Record<string, unknown>;
  if (!data.trace || typeof data.trace !== "object") return null;
  const trace = data.trace as Record<string, unknown>;
  return {
    toolName: (trace.toolName as string) ?? null,
    promptHash: (trace.promptHash as string) ?? null,
    promptCategory: (trace.promptCategory as string) ?? null,
    overallScore: (trace.overallScore as number) ?? 0,
    signals: (trace.signals as TraceSignals) ?? {},
  };
}

/**
 * Compute the dominant signal -- which factor contributed most to the decision.
 */
export function dominantSignal(signals: TraceSignals): string {
  let max = 0;
  let name = "unknown";
  for (const [key, sig] of Object.entries(signals)) {
    if (sig && typeof sig.contribution === "number" && sig.contribution > max) {
      max = sig.contribution;
      name = key;
    }
  }
  return name;
}
