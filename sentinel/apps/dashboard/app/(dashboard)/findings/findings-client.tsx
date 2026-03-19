"use client";

import { useState } from "react";
import Link from "next/link";
import { FindingCard } from "@/components/finding-card";
import { EmptyState } from "@/components/empty-state";
import { IconCheckCircle, IconSearch } from "@/components/icons";
import type { Finding } from "@/lib/types";

type Severity = "all" | "critical" | "high" | "medium" | "low";

const SEVERITY_COLORS: Record<Severity, string> = {
  all: "bg-surface-2 text-text-secondary",
  critical: "bg-severity-critical/15 text-severity-critical",
  high: "bg-severity-high/15 text-severity-high",
  medium: "bg-severity-medium/15 text-severity-medium",
  low: "bg-severity-low/15 text-severity-low",
};

const BORDER_COLORS: Record<string, string> = {
  critical: "border-l-severity-critical",
  high: "border-l-severity-high",
  medium: "border-l-severity-medium",
  low: "border-l-severity-low",
};

interface FindingsClientProps {
  findings: Finding[];
}

export function FindingsClient({ findings }: FindingsClientProps) {
  const [activeSeverity, setActiveSeverity] = useState<Severity>("all");
  const [showSuppressed, setShowSuppressed] = useState(false);

  const activeFindings = findings.filter((f) => f.status !== "suppressed");
  const suppressedFindings = findings.filter((f) => f.status === "suppressed");
  const suppressedCount = suppressedFindings.length;

  const baseFindings = showSuppressed ? findings : activeFindings;

  const filtered =
    activeSeverity === "all"
      ? baseFindings
      : baseFindings.filter((f) => f.severity === activeSeverity);

  const counts: Record<Severity, number> = {
    all: baseFindings.length,
    critical: baseFindings.filter((f) => f.severity === "critical").length,
    high: baseFindings.filter((f) => f.severity === "high").length,
    medium: baseFindings.filter((f) => f.severity === "medium").length,
    low: baseFindings.filter((f) => f.severity === "low").length,
  };

  if (activeFindings.length === 0 && suppressedCount === 0) {
    return (
      <EmptyState
        icon={IconCheckCircle}
        headline="No open findings — your codebase is clean"
        body="All recent scans passed without security, dependency, or policy violations."
        variant="success"
        secondaryLink={{ label: "View scan history", href: "/projects" }}
      />
    );
  }

  const severities: Severity[] = ["all", "critical", "high", "medium", "low"];

  return (
    <div className="space-y-4">
      {/* Severity filter pills */}
      <div className="flex flex-wrap gap-2">
        {severities.map((sev) => (
          <button
            key={sev}
            onClick={() => setActiveSeverity(sev)}
            aria-pressed={activeSeverity === sev}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-all focus-ring ${
              activeSeverity === sev
                ? SEVERITY_COLORS[sev] + " ring-1 ring-inset ring-current/30"
                : "bg-surface-1 text-text-tertiary hover:bg-surface-2"
            }`}
          >
            {sev === "all" ? "All" : sev} ({counts[sev]})
          </button>
        ))}
      </div>

      {/* Show suppressed toggle */}
      {suppressedCount > 0 && (
        <button
          onClick={() => setShowSuppressed((v) => !v)}
          className="text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {showSuppressed ? "Hide" : "Show"} suppressed ({suppressedCount})
        </button>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={IconSearch}
          headline="No findings match these filters"
          body="Try adjusting your severity filter."
        />
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((finding, i) => {
            const isSuppressed = finding.status === "suppressed";
            return (
              <Link
                key={finding.id}
                href={`/findings/${finding.id}`}
                className={`animate-fade-up block focus-ring rounded-lg border-l-2 ${BORDER_COLORS[finding.severity] ?? "border-l-border"} ${isSuppressed ? "opacity-60" : ""}`}
                style={{ animationDelay: `${0.03 + 0.04 * i}s` }}
                aria-label={`View finding: ${finding.title}`}
              >
                {isSuppressed && (
                  <div className="px-4 pt-2">
                    <span className="inline-block rounded-full bg-surface-3 px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
                      Suppressed
                    </span>
                  </div>
                )}
                <FindingCard finding={finding} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
