const BASE_SCORES: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 15,
  low: 5,
};

export interface PriorityScoreInput {
  priority: string;
  dueDate: Date | null;
  linkedFindingIds: string[];
  findingId: string | null;
}

export function computePriorityScore(input: PriorityScoreInput): number {
  let score = BASE_SCORES[input.priority] ?? 15;

  // SLA decay (0-40)
  if (input.dueDate) {
    const msLeft = input.dueDate.getTime() - Date.now();
    if (msLeft <= 0) {
      score += 40;
    } else {
      const hoursLeft = msLeft / 3_600_000;
      score += Math.min(40, Math.round(40 * Math.exp(-hoursLeft / 24)));
    }
  }

  // Blast radius (0-20)
  const findingCount = input.linkedFindingIds.length + (input.findingId ? 1 : 0);
  score += Math.min(20, findingCount * 4);

  return Math.min(100, score);
}
