export const WORKFLOW_STAGES = [
  "open", "assigned", "in_progress", "in_review", "awaiting_deployment", "completed",
] as const;

export const TERMINAL_STAGES = new Set(["completed", "accepted_risk"]);
export const SPECIAL_STAGES = new Set(["accepted_risk", "blocked"]);
const REQUIRED_STAGES = new Set(["open", "completed"]);
const SKIPPABLE_STAGES = new Set(["assigned", "in_progress", "in_review", "awaiting_deployment"]);

export class WorkflowFSM {
  private activeStages: string[];

  constructor(skipStages: string[]) {
    for (const s of skipStages) {
      if (REQUIRED_STAGES.has(s)) throw new Error(`Cannot skip required stage: ${s}`);
      if (!SKIPPABLE_STAGES.has(s)) throw new Error(`Invalid skip stage: ${s}`);
    }
    const skipSet = new Set(skipStages);
    this.activeStages = WORKFLOW_STAGES.filter((s) => !skipSet.has(s));
  }

  getActiveStages(): string[] {
    return [...this.activeStages, "accepted_risk", "blocked"];
  }

  nextStage(current: string): string | null {
    const idx = this.activeStages.indexOf(current);
    if (idx === -1 || idx >= this.activeStages.length - 1) return null;
    return this.activeStages[idx + 1];
  }

  canTransition(from: string, to: string): boolean {
    if (TERMINAL_STAGES.has(from)) return false;
    if (to === "accepted_risk" || to === "blocked") return true;

    const fromIdx = this.activeStages.indexOf(from);
    const toIdx = this.activeStages.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return false;

    return toIdx === fromIdx + 1 || toIdx < fromIdx;
  }
}
