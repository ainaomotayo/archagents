// tests/e2e/services/scheduler-service.ts
export interface SchedulerHealth {
  status: string;
  uptime: number;
  lastTrigger: Record<string, string>;
  nextScheduled: Record<string, string>;
  isLeader?: boolean;
  circuits?: Record<string, { state: string; failures: number }>;
}

export class SchedulerService {
  constructor(private readonly baseUrl: string) {}

  async getHealth(): Promise<SchedulerHealth> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Scheduler health failed: ${res.status}`);
    return res.json() as Promise<SchedulerHealth>;
  }

  async getMetrics(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/metrics`);
    if (!res.ok) throw new Error(`Scheduler metrics failed: ${res.status}`);
    return res.text();
  }
}
