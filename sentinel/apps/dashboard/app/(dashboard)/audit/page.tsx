import { getAuditLog } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const ACTION_STYLES: Record<string, string> = {
  scan: "bg-status-info/15 text-status-info border-status-info/30",
  certificate: "bg-status-pass/15 text-status-pass border-status-pass/30",
  revocation: "bg-status-fail/15 text-status-fail border-status-fail/30",
  policy: "bg-status-running/15 text-status-running border-status-running/30",
  finding: "bg-status-warn/15 text-status-warn border-status-warn/30",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AuditLogPage() {
  const events = await getAuditLog();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="Chronological record of all platform events for compliance tracking."
      />

      <div className="animate-fade-up overflow-hidden rounded-xl border border-border bg-surface-1" style={{ animationDelay: "0.05s" }}>
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Timestamp</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Action</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Actor</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Resource</th>
              <th scope="col" className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {events.map((event) => (
              <tr key={event.id} className="table-row-hover transition-colors">
                <td className="px-5 py-3.5 whitespace-nowrap text-xs text-text-tertiary">
                  {formatDate(event.timestamp)}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ACTION_STYLES[event.action] ?? "bg-surface-3 text-text-tertiary border-border"}`}
                  >
                    {event.action}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-text-secondary">{event.actor}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-accent">
                  {event.resource}
                </td>
                <td className="px-5 py-3.5 text-xs text-text-tertiary">
                  {event.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
