interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  resource: string;
  details: string;
}

interface AttestationAuditTrailProps {
  events: AuditEvent[];
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttestationAuditTrail({ events }: AttestationAuditTrailProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-1 p-4">
        <p className="text-[12px] text-text-tertiary text-center">
          No audit events yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[12px] font-semibold text-text-secondary mb-2">
        Audit Trail
      </p>
      <div className="space-y-0">
        {events.map((event, i) => (
          <div key={event.id} className="flex gap-3 py-2">
            <div className="flex flex-col items-center">
              <span className="h-2 w-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
              {i < events.length - 1 && (
                <span className="mt-1 w-px flex-1 bg-border" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium text-text-primary">
                  {event.actor}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              <p className="text-[12px] text-text-secondary">{event.details}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
