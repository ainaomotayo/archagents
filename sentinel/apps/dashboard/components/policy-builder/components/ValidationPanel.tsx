"use client";

import { useValidation } from "../contexts/validation-context";
import { useSelection } from "../contexts/selection-context";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationPanel() {
  const { issues, hasErrors, errorCount, warningCount } = useValidation();
  const { select } = useSelection();

  return (
    <div>
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-2">
        Validation
      </h3>
      <div className="rounded-xl border border-border bg-surface-0 p-4 max-h-[300px] overflow-y-auto space-y-2">
        {!hasErrors && warningCount === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-status-pass/10 border border-status-pass/30 px-3 py-2">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-4 w-4 text-status-pass"
            >
              <path d="M4 8.5l3 3 5-6" />
            </svg>
            <span className="text-[13px] font-medium text-status-pass">
              Policy is valid
            </span>
          </div>
        ) : (
          issues.map((issue, i) => {
            const isError = issue.level === "error";
            const cardClass = isError
              ? "bg-status-fail/10 border-status-fail/30"
              : "bg-status-warn/10 border-status-warn/30";
            const textClass = isError ? "text-status-fail" : "text-status-warn";

            return (
              <button
                key={`${issue.nodeId}-${i}`}
                type="button"
                onClick={() => select(issue.nodeId)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors hover:opacity-80 ${cardClass}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${textClass} mt-0.5 shrink-0`}
                  >
                    {issue.level === "error" ? "ERROR" : "WARNING"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-medium ${textClass}`}>
                      {issue.message}
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Node: {issue.nodeId}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
