"use client";

import { useState, useCallback } from "react";
import { simulate } from "@sentinel/policy-engine";
import type { SimulationResult } from "@sentinel/policy-engine";
import { useTree } from "../contexts/tree-context";
import { useSelection } from "../contexts/selection-context";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLACEHOLDER_INPUT = `{
  "severity": "critical",
  "category": "secret-detection",
  "riskScore": 75,
  "branch": "main"
}`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SimulationPanel() {
  const { tree } = useTree();
  const { setSimulationTrace } = useSelection();

  const [sampleInput, setSampleInput] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    setError(null);
    setResult(null);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(sampleInput || "{}");
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      setSimulationTrace(null);
      return;
    }

    try {
      const simResult = simulate(tree, parsed);
      setResult(simResult);

      // Build trace map for canvas highlighting
      const traceMap = new Map<string, boolean>();
      for (const t of simResult.trace) {
        traceMap.set(t.nodeId, t.match);
      }
      setSimulationTrace(traceMap);
    } catch (e) {
      setError(`Simulation error: ${(e as Error).message}`);
      setSimulationTrace(null);
    }
  }, [sampleInput, tree, setSimulationTrace]);

  const handleClear = useCallback(() => {
    setResult(null);
    setError(null);
    setSimulationTrace(null);
  }, [setSimulationTrace]);

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
        Simulation
      </h3>
      <div className="rounded-xl border border-border bg-surface-0 p-4 space-y-3">
        {/* Input textarea */}
        <textarea
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          placeholder={PLACEHOLDER_INPUT}
          rows={6}
          className="w-full rounded-lg border border-border bg-surface-1 p-3 font-mono text-[12px] leading-5 text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-1 focus:ring-accent"
        />

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRun}
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-text-inverse hover:opacity-90 transition-opacity"
          >
            Run Simulation
          </button>
          {result && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-status-fail/10 border border-status-fail/30 px-3 py-2">
            <p className="text-[13px] text-status-fail">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            {/* Match badge */}
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                  result.match
                    ? "bg-status-pass/10 text-status-pass"
                    : "bg-status-fail/10 text-status-fail"
                }`}
              >
                {result.match ? "MATCH" : "NO MATCH"}
              </span>
              <span className="text-[11px] text-text-tertiary">
                {result.evaluationTimeMs.toFixed(2)}ms
              </span>
            </div>

            {/* Matched actions */}
            {result.matchedActions.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-text-secondary mb-1">
                  Matched Actions
                </p>
                <div className="space-y-1">
                  {result.matchedActions.map((action) => (
                    <div
                      key={action.nodeId}
                      className="rounded-md bg-status-pass/10 border border-status-pass/30 px-2 py-1 text-[12px] text-status-pass"
                    >
                      {action.actionType}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trace */}
            {result.trace.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-text-secondary mb-1">
                  Evaluation Trace
                </p>
                <div className="space-y-0.5">
                  {result.trace.map((t) => (
                    <div
                      key={t.nodeId}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          t.match ? "bg-status-pass" : "bg-status-fail"
                        }`}
                      />
                      <span className="text-text-secondary font-mono">
                        {t.nodeId.slice(0, 8)}
                      </span>
                      <span className="text-text-tertiary">
                        {t.match ? "matched" : "no match"}
                        {t.shortCircuited ? " (short-circuited)" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
