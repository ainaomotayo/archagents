"use client";

import { useEffect, useState } from "react";
import type { SelectedCell } from "./types";
import type { ComplianceTrendPoint } from "@/lib/types";
import { ScoreBadge } from "./ScoreBadge";
import { TrendSparkline } from "./TrendSparkline";
import { scoreToVerdict } from "./types";

interface ControlDetailPanelProps {
  cell: SelectedCell | null;
  getTrends: (slug: string) => Promise<ComplianceTrendPoint[]>;
}

export function ControlDetailPanel({ cell, getTrends }: ControlDetailPanelProps) {
  const [trends, setTrends] = useState<ComplianceTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cell) {
      setTrends([]);
      return;
    }
    setLoading(true);
    getTrends(cell.frameworkSlug).then((data) => {
      setTrends(data);
      setLoading(false);
    });
  }, [cell, getTrends]);

  if (!cell) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-8 text-center">
        <p className="text-[13px] text-text-tertiary">
          Click a cell to view control details
        </p>
      </div>
    );
  }

  const trendDelta =
    trends.length >= 2
      ? Math.round(
          (trends[trends.length - 1].score - trends[0].score) * 100,
        )
      : null;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[14px] font-bold text-text-primary">
            {cell.controlCode} — {cell.controlName}
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {cell.frameworkName}
          </p>
        </div>
        <ScoreBadge score={cell.score} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-text-tertiary">Verdict</p>
          <p className="text-[13px] font-semibold text-text-primary">
            {scoreToVerdict(cell.score)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Passing</p>
          <p className="font-mono text-[13px] font-semibold text-status-pass">
            {cell.passing}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Failing</p>
          <p className="font-mono text-[13px] font-semibold text-status-fail">
            {cell.failing}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Total</p>
          <p className="font-mono text-[13px] font-semibold text-text-primary">
            {cell.total}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-text-tertiary">
            30-day trend
          </p>
          {trendDelta !== null && (
            <span
              className={`text-[11px] font-semibold ${trendDelta >= 0 ? "text-status-pass" : "text-status-fail"}`}
            >
              {trendDelta >= 0 ? "+" : ""}
              {trendDelta}%
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex h-[80px] items-center justify-center">
            <span className="text-[11px] text-text-tertiary">Loading...</span>
          </div>
        ) : (
          <TrendSparkline data={trends} />
        )}
      </div>

      {cell.failing > 0 && (
        <a
          href={`/findings?framework=${cell.frameworkSlug}&control=${cell.controlCode}`}
          className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
        >
          View {cell.failing} findings &rarr;
        </a>
      )}
    </div>
  );
}
