import type { Attestation } from "./attestation-types";

interface AttestationSummaryCardsProps {
  attestations: Attestation[];
}

export function AttestationSummaryCards({ attestations }: AttestationSummaryCardsProps) {
  const total = attestations.length;
  const approved = attestations.filter((a) => a.status === "approved").length;
  const pending = attestations.filter(
    (a) => a.status === "pending_review" || a.status === "pending_approval",
  ).length;

  const now = new Date();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  const expiringSoon = attestations.filter((a) => {
    if (a.status !== "approved") return false;
    const expires = new Date(a.expiresAt);
    return expires.getTime() - now.getTime() < thirtyDays && expires > now;
  }).length;

  const cards = [
    { label: "Total", value: String(total) },
    { label: "Approved", value: String(approved) },
    { label: "Pending", value: String(pending) },
    { label: "Expiring Soon", value: String(expiringSoon) },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-surface-1 px-4 py-3"
        >
          <p className="text-[11px] font-medium text-text-tertiary">
            {card.label}
          </p>
          <p className="mt-1 text-lg font-bold text-text-primary">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
