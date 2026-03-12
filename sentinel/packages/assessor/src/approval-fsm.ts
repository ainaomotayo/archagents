/**
 * Finite State Machine for approval gate lifecycle.
 *
 * States: pending, escalated, approved, rejected, expired
 * Terminal states: approved, rejected, expired
 *
 * Transitions:
 *   pending   -> approve  -> approved
 *   pending   -> reject   -> rejected
 *   pending   -> escalate -> escalated
 *   pending   -> expire   -> expired
 *   escalated -> approve  -> approved
 *   escalated -> reject   -> rejected
 *   escalated -> expire   -> expired
 */

export type GateState =
  | "pending"
  | "escalated"
  | "approved"
  | "rejected"
  | "expired";

export type GateAction =
  | "approve"
  | "reject"
  | "escalate"
  | "expire";

const TRANSITIONS: Record<string, Record<string, GateState>> = {
  pending: {
    approve: "approved",
    reject: "rejected",
    escalate: "escalated",
    expire: "expired",
  },
  escalated: {
    approve: "approved",
    reject: "rejected",
    expire: "expired",
  },
};

const TERMINAL_STATES: Set<GateState> = new Set([
  "approved",
  "rejected",
  "expired",
]);

export const ApprovalFSM = {
  /**
   * Execute a state transition. Throws if the transition is invalid.
   */
  transition(current: GateState, action: GateAction): GateState {
    const next = TRANSITIONS[current]?.[action];
    if (!next) {
      throw new Error(
        `Invalid transition: cannot apply "${action}" to state "${current}"`,
      );
    }
    return next;
  },

  /** Whether the state is terminal (no further transitions possible). */
  isTerminal(state: GateState): boolean {
    return TERMINAL_STATES.has(state);
  },

  /** Whether a human decision (approve/reject) can be applied in this state. */
  canDecide(state: GateState): boolean {
    return state === "pending" || state === "escalated";
  },
};
