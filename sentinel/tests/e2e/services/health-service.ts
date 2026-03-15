// tests/e2e/services/health-service.ts
export interface ServiceHealth {
  status: string;
  uptime?: number;
}

const SERVICES = [
  { name: "api", url: "http://localhost:8081/health" },
  { name: "assessor-worker", url: "http://localhost:9092/health" },
  { name: "notification-worker", url: "http://localhost:9095/health" },
  { name: "agent-security", url: "http://localhost:8082/health" },
  { name: "agent-dependency", url: "http://localhost:8084/health" },
];

export class HealthService {
  async getStatus(name: string): Promise<ServiceHealth> {
    const svc = SERVICES.find((s) => s.name === name);
    if (!svc) throw new Error(`Unknown service: ${name}`);
    const res = await fetch(svc.url);
    return res.json() as Promise<ServiceHealth>;
  }

  async allHealthy(): Promise<boolean> {
    try {
      const results = await Promise.all(
        SERVICES.map(async (s) => {
          const res = await fetch(s.url);
          return res.ok;
        }),
      );
      return results.every(Boolean);
    } catch {
      return false;
    }
  }
}
