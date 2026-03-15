"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconCalendarEvent, IconClock } from "@/components/icons";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

interface ScheduleSummary {
  enabled: boolean;
  nextRunAt: string | null;
}

export function ScheduledReportsWidget() {
  const [activeCount, setActiveCount] = useState(0);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchSchedules() {
      try {
        const res = await fetch(`${API_BASE}/v1/report-schedules?limit=100`);
        if (!res.ok) return;
        const data = await res.json();
        const schedules: ScheduleSummary[] = data.data ?? data;
        const active = schedules.filter((s) => s.enabled);
        setActiveCount(active.length);

        const nextDates = active
          .map((s) => s.nextRunAt)
          .filter(Boolean)
          .sort();
        setNextRun(nextDates[0] ?? null);
      } catch {
        // silently fail — widget is non-critical
      } finally {
        setLoaded(true);
      }
    }
    fetchSchedules();
  }, []);

  if (!loaded) return null;

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 px-5 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3">
            <IconCalendarEvent className="h-4 w-4 text-text-tertiary" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text-primary">
              Scheduled Reports
            </p>
            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-text-tertiary">
              <span>
                <strong className="text-text-secondary">{activeCount}</strong>{" "}
                active schedule{activeCount !== 1 ? "s" : ""}
              </span>
              {nextRun && (
                <span className="flex items-center gap-1">
                  <IconClock className="h-3 w-3" />
                  Next:{" "}
                  {new Date(nextRun).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link
          href="/settings/report-schedules"
          className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-border-accent hover:bg-surface-2 hover:text-text-primary"
        >
          Manage schedules
        </Link>
      </div>
    </div>
  );
}
