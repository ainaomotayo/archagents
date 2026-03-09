import type { ScanStatus } from "@/lib/types";

const STATUS_STYLES: Record<ScanStatus, string> = {
  pass: "bg-status-pass/15 text-status-pass border-status-pass/30",
  fail: "bg-status-fail/15 text-status-fail border-status-fail/30",
  provisional: "bg-status-warn/15 text-status-warn border-status-warn/30",
  running: "bg-status-running/15 text-status-running border-status-running/30",
};

const STATUS_DOT: Record<ScanStatus, string> = {
  pass: "bg-status-pass",
  fail: "bg-status-fail",
  provisional: "bg-status-warn",
  running: "bg-status-running status-running",
};

export function StatusBadge({ status }: { status: ScanStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  );
}
