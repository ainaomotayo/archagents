export type ProviderStatus = "healthy" | "degraded" | "down";

export class ProviderHealthMonitor {
  private scores = new Map<string, number>();
  private alpha: number;

  constructor(alpha = 0.3) {
    this.alpha = alpha;
  }

  recordSuccess(providerId: string): void {
    const current = this.scores.get(providerId) ?? 1.0;
    this.scores.set(providerId, this.alpha * 1.0 + (1 - this.alpha) * current);
  }

  recordFailure(providerId: string): void {
    const current = this.scores.get(providerId) ?? 1.0;
    this.scores.set(providerId, this.alpha * 0.0 + (1 - this.alpha) * current);
  }

  getHealth(providerId: string): { score: number; status: ProviderStatus } {
    const score = this.scores.get(providerId) ?? 1.0;
    const status: ProviderStatus =
      score >= 0.7 ? "healthy" : score >= 0.3 ? "degraded" : "down";
    return { score: Math.round(score * 1000) / 1000, status };
  }

  getAll(): Record<string, { score: number; status: ProviderStatus }> {
    const result: Record<string, { score: number; status: ProviderStatus }> = {};
    for (const [id] of this.scores) {
      result[id] = this.getHealth(id);
    }
    return result;
  }
}
