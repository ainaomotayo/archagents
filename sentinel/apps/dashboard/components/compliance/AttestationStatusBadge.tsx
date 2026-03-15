import type { AttestationStatus } from "./attestation-types";
import { statusColor, statusLabel } from "./attestation-types";

export function AttestationStatusBadge({ status }: { status: AttestationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusColor(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
