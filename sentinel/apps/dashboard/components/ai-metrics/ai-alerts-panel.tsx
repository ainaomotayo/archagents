"use client";

import type { AIAnomalyAlert } from "@/lib/types";

const SEVERITY_STYLES: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400" },
};

const TYPE_LABELS: Record<string, string> = {
  threshold_exceeded: "Threshold Exceeded",
  spike_detected: "Spike Detected",
  new_tool: "New Tool Detected",
};

interface Props {
  alerts: AIAnomalyAlert[];
}

export function AIAlertsPanel({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
        <h3 className="text-sm font-semibold text-text-primary">Alerts</h3>
        <p className="mt-4 text-[13px] text-text-tertiary">No active alerts.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up rounded-xl border border-border bg-surface-1 p-5" style={{ animationDelay: "0.03s" }}>
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Alerts</h3>
      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const style = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.warning;
          return (
            <div
              key={`${alert.type}-${alert.detectedAt}-${i}`}
              className={`rounded-lg border border-border p-4 ${style.bg}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${style.bg} ${style.text}`}
                >
                  {alert.severity}
                </span>
                <span className="text-[11px] font-medium text-text-secondary">
                  {TYPE_LABELS[alert.type] ?? alert.type}
                </span>
                {alert.projectName && (
                  <span className="ml-auto text-[11px] text-text-tertiary">
                    {alert.projectName}
                  </span>
                )}
              </div>
              <p className="mt-2 text-[13px] text-text-primary">{alert.detail}</p>
              <p className="mt-1 text-[10px] text-text-tertiary">
                {new Date(alert.detectedAt).toLocaleString()}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
