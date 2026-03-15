"use client";

import { useState, useCallback } from "react";
import type { RemediationItem } from "@/lib/types";
import { triggerAutoFixAction } from "@/app/(dashboard)/remediations/actions";

interface AutoFixButtonProps {
  item: RemediationItem;
}

export function AutoFixButton({ item }: AutoFixButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ prUrl: string; branch: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAutoFix = !!item.findingId && !item.externalRef;

  const handleAutoFix = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await triggerAutoFixAction(item.id);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fix failed.");
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  if (!item.findingId) return null;

  return (
    <div className="space-y-3">
      <button
        onClick={handleAutoFix}
        disabled={loading || !canAutoFix}
        className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-[13px] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.192-.14 1.743"
          />
        </svg>
        {loading ? "Generating Fix..." : "Auto-Fix"}
      </button>

      {!canAutoFix && item.externalRef && (
        <p className="text-[11px] text-text-tertiary">
          Auto-fix disabled: this item already has an external reference ({item.externalRef}).
        </p>
      )}

      {error && (
        <p className="text-[12px] text-status-fail">{error}</p>
      )}

      {result && (
        <div className="rounded-lg border border-status-pass/30 bg-status-pass/10 p-3 space-y-1">
          <p className="text-[12px] font-semibold text-status-pass">
            Auto-fix PR created successfully
          </p>
          <p className="text-[11px] text-text-secondary">
            Branch: <span className="font-mono">{result.branch}</span>
          </p>
          <a
            href={result.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            View Pull Request
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
              />
            </svg>
          </a>
        </div>
      )}
    </div>
  );
}
