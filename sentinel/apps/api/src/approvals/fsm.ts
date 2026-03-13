export type ApprovalStatus = "pending" | "escalated" | "approved" | "rejected" | "expired";

export const TERMINAL_STATUSES: readonly ApprovalStatus[] = ["approved", "rejected", "expired"];

const TRANSITIONS: Record<string, ApprovalStatus[]> = {
  pending:   ["escalated", "approved", "rejected", "expired"],
  escalated: ["approved", "rejected", "expired"],
  approved:  [],
  rejected:  [],
  expired:   [],
};

export function canTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function validateTransition(
  from: ApprovalStatus,
  to: ApprovalStatus,
): { ok: true } | { ok: false; error: string } {
  if (canTransition(from, to)) return { ok: true };
  return {
    ok: false,
    error: `Cannot transition from '${from}' to '${to}'. Allowed: [${TRANSITIONS[from]?.join(", ") ?? "none"}]`,
  };
}
