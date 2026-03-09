import { getAuditLog } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const ACTION_STYLES: Record<string, string> = {
  scan: "bg-status-info/15 text-status-info border-status-info/30",
  certificate: "bg-status-pass/15 text-status-pass border-status-pass/30",
  revocation: "bg-status-fail/15 text-status-fail border-status-fail/30",
  policy: "bg-status-running/15 text-status-running border-status-running/30",
  finding: "bg-status-warn/15 text-status-warn border-status-warn/30",
};

const ACTION_DOT_COLORS: Record<string, string> = {
  scan: "border-status-info bg-status-info/20",
  certificate: "border-status-pass bg-status-pass/20",
  revocation: "border-status-fail bg-status-fail/20",
  policy: "border-status-running bg-status-running/20",
  finding: "border-status-warn bg-status-warn/20",
};

const ACTION_DOT_INNER: Record<string, string> = {
  scan: "bg-status-info",
  certificate: "bg-status-pass",
  revocation: "bg-status-fail",
  policy: "bg-status-running",
  finding: "bg-status-warn",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default async function AuditLogPage() {
  const events = await getAuditLog();

  /* Compute counts per action type for the filter strip */
  const actionCounts: Record<string, number> = {};
  for (const event of events) {
    actionCounts[event.action] = (actionCounts[event.action] ?? 0) + 1;
  }

  const allActionTypes = Object.keys(ACTION_STYLES);
  const hasEvents = events.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Chronological record of all platform events for compliance tracking."
      />

      {/* ── Event type filter strip ──────────────────────────────── */}
      <div
        className="animate-fade-up flex flex-wrap items-center gap-2"
        style={{ animationDelay: "0.03s" }}
      >
        {/* All pill */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-accent">
          All
          <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent/20 px-1 text-[10px] font-bold tabular-nums text-accent">
            {events.length}
          </span>
        </span>

        {allActionTypes.map((action) => {
          const count = actionCounts[action] ?? 0;
          const style =
            ACTION_STYLES[action] ??
            "bg-surface-3 text-text-tertiary border-border";
          return (
            <span
              key={action}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${style} ${count === 0 ? "opacity-40" : ""}`}
            >
              {action}
              <span
                className={`ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${count === 0 ? "bg-surface-3/50 text-text-tertiary" : "bg-white/10 text-inherit"}`}
              >
                {count}
              </span>
            </span>
          );
        })}
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      {hasEvents ? (
        <div
          className="animate-fade-up overflow-hidden rounded-xl border border-border bg-surface-1"
          style={{ animationDelay: "0.05s" }}
        >
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th
                  scope="col"
                  className="w-[18px] px-0 py-3 pl-4"
                  aria-hidden="true"
                />
                <th
                  scope="col"
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                >
                  Timestamp
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                >
                  Action
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                >
                  Actor
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                >
                  Resource
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary"
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {events.map((event, i) => {
                const dotOuter =
                  ACTION_DOT_COLORS[event.action] ??
                  "border-border bg-surface-3";
                const dotInner =
                  ACTION_DOT_INNER[event.action] ?? "bg-text-tertiary";

                return (
                  <tr
                    key={event.id}
                    className="table-row-hover group transition-colors"
                  >
                    {/* Timeline dot */}
                    <td className="relative w-[18px] px-0 py-3.5 pl-4">
                      {/* Vertical connector line */}
                      {i < events.length - 1 && (
                        <div className="absolute bottom-0 left-[22px] top-[28px] w-px bg-border-subtle" />
                      )}
                      {i > 0 && (
                        <div className="absolute left-[22px] top-0 h-[14px] w-px bg-border-subtle" />
                      )}
                      <div
                        className={`relative z-10 h-[14px] w-[14px] flex-shrink-0 rounded-full border-2 ${dotOuter}`}
                      >
                        <div
                          className={`absolute inset-[2px] rounded-full ${dotInner}`}
                        />
                      </div>
                    </td>

                    {/* Timestamp with relative time */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-xs text-text-secondary">
                          {formatDate(event.timestamp)}
                        </span>
                        <span className="mt-0.5 text-[10px] text-text-tertiary">
                          {formatRelative(event.timestamp)}
                        </span>
                      </div>
                    </td>

                    {/* Action badge */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ACTION_STYLES[event.action] ?? "bg-surface-3 text-text-tertiary border-border"}`}
                      >
                        {event.action}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="px-4 py-3.5 text-text-secondary">
                      {event.actor}
                    </td>

                    {/* Resource - clickable-looking */}
                    <td className="px-4 py-3.5">
                      <span className="cursor-pointer font-mono text-xs text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:text-accent/80 hover:decoration-accent/50">
                        {event.resource}
                      </span>
                    </td>

                    {/* Details - more prominent */}
                    <td className="px-4 py-3.5 text-xs text-text-secondary">
                      {event.details}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Empty state ──────────────────────────────────────── */
        <div
          className="animate-fade-up flex flex-col items-center justify-center rounded-xl border border-border bg-surface-1 px-6 py-20"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2">
            <svg
              className="h-6 w-6 text-text-tertiary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-semibold text-text-primary">
            No audit events yet
          </h3>
          <p className="mt-1 max-w-sm text-center text-[12px] text-text-tertiary">
            When scans run, certificates are issued, or policies change, events
            will appear here in chronological order.
          </p>
        </div>
      )}
    </div>
  );
}
