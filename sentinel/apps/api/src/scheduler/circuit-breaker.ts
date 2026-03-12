import type { CircuitBreakerState, JobTier } from "./types.js";

const THRESHOLDS: Record<JobTier, { failureThreshold: number; cooldownMs: number }> = {
  "critical":     { failureThreshold: 5, cooldownMs: 30_000 },
  "non-critical": { failureThreshold: 3, cooldownMs: 60_000 },
};

export class CircuitBreakerManager {
  private circuits = new Map<string, CircuitBreakerState>();

  private getOrCreate(dep: string): CircuitBreakerState {
    let circuit = this.circuits.get(dep);
    if (!circuit) {
      circuit = { state: "closed", failures: 0, lastFailure: null, lastSuccess: null };
      this.circuits.set(dep, circuit);
    }
    return circuit;
  }

  canExecute(dep: string, tier: JobTier): boolean {
    const circuit = this.getOrCreate(dep);
    const { failureThreshold, cooldownMs } = THRESHOLDS[tier];

    if (circuit.state === "closed") {
      return circuit.failures < failureThreshold;
    }

    if (circuit.state === "open") {
      if (circuit.failures < failureThreshold) {
        return true;
      }
      const elapsed = Date.now() - (circuit.lastFailure ?? 0);
      if (elapsed >= cooldownMs) {
        circuit.state = "half-open";
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(dep: string): void {
    const circuit = this.getOrCreate(dep);
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
    circuit.state = "closed";
  }

  recordFailure(dep: string): void {
    const circuit = this.getOrCreate(dep);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === "half-open") {
      circuit.state = "open";
      return;
    }

    const minThreshold = THRESHOLDS["non-critical"].failureThreshold;
    if (circuit.failures >= minThreshold) {
      circuit.state = "open";
    }
  }

  getState(dep: string): CircuitBreakerState["state"] {
    return this.getOrCreate(dep).state;
  }

  getAllStates(): Record<string, CircuitBreakerState> {
    const result: Record<string, CircuitBreakerState> = {};
    for (const [dep, state] of this.circuits) {
      result[dep] = { ...state };
    }
    return result;
  }
}
