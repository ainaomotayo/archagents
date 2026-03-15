import type { WizardControlMeta, StepState } from "./types.js";

/**
 * Kahn's algorithm — returns controls grouped by topological phase.
 * Time complexity: O(V + E) where V = controls, E = dependency edges.
 */
export function topologicalSort(controls: WizardControlMeta[]): WizardControlMeta[][] {
  if (controls.length === 0) return [];

  const controlMap = new Map(controls.map((c) => [c.code, c]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const c of controls) {
    inDegree.set(c.code, c.dependencies.length);
    for (const dep of c.dependencies) {
      const list = dependents.get(dep) ?? [];
      list.push(c.code);
      dependents.set(dep, list);
    }
  }

  const phases: WizardControlMeta[][] = [];
  let remaining = controls.length;

  while (remaining > 0) {
    const phase: WizardControlMeta[] = [];
    for (const [code, deg] of inDegree) {
      if (deg === 0) {
        phase.push(controlMap.get(code)!);
      }
    }

    if (phase.length === 0) {
      const cycle = Array.from(inDegree.keys()).filter((k) => inDegree.get(k)! > 0);
      throw new Error(`Cycle detected among controls: ${cycle.join(", ")}`);
    }

    // Sort within phase for deterministic ordering
    phase.sort((a, b) => a.code.localeCompare(b.code));

    for (const c of phase) {
      inDegree.delete(c.code);
      for (const dep of dependents.get(c.code) ?? []) {
        inDegree.set(dep, inDegree.get(dep)! - 1);
      }
    }

    phases.push(phase);
    remaining -= phase.length;
  }

  return phases;
}

/**
 * Given current step states, return codes of steps that should be "available".
 * A step is available if:
 *  - It is currently "locked"
 *  - All its dependencies are "completed" or ("skipped" with skipUnlocksDependents=true)
 */
export function computeAvailableSteps(
  controls: WizardControlMeta[],
  stepStates: Map<string, StepState>,
): string[] {
  const controlMap = new Map(controls.map((c) => [c.code, c]));
  const available: string[] = [];

  for (const control of controls) {
    const state = stepStates.get(control.code);
    if (state !== "locked") continue;

    if (canUnlock(control.code, controls, stepStates, controlMap)) {
      available.push(control.code);
    }
  }

  return available;
}

/**
 * Check if a specific step can unlock based on dependency states.
 */
export function canUnlock(
  code: string,
  controls: WizardControlMeta[],
  stepStates: Map<string, StepState>,
  controlMap: Map<string, WizardControlMeta>,
): boolean {
  const control = controlMap.get(code);
  if (!control) return false;

  if (control.dependencies.length === 0) return true;

  return control.dependencies.every((depCode) => {
    const depState = stepStates.get(depCode);
    if (depState === "completed") return true;
    if (depState === "skipped") {
      const depControl = controlMap.get(depCode);
      return depControl?.skipUnlocksDependents ?? false;
    }
    return false;
  });
}

/**
 * Validate the DAG has no cycles. Returns {valid: true} or {valid: false, cycle: [codes]}.
 */
export function validateDAG(controls: WizardControlMeta[]): { valid: boolean; cycle?: string[] } {
  if (controls.length === 0) return { valid: true };

  const controlMap = new Map(controls.map((c) => [c.code, c]));
  const inDegree = new Map<string, number>();

  for (const c of controls) {
    if (!inDegree.has(c.code)) inDegree.set(c.code, 0);
    for (const dep of c.dependencies) {
      inDegree.set(c.code, (inDegree.get(c.code) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [code, deg] of inDegree) {
    if (deg === 0) queue.push(code);
  }

  let processed = 0;
  while (queue.length > 0) {
    const code = queue.shift()!;
    processed++;
    for (const c of controls) {
      if (c.dependencies.includes(code)) {
        inDegree.set(c.code, inDegree.get(c.code)! - 1);
        if (inDegree.get(c.code) === 0) queue.push(c.code);
      }
    }
  }

  if (processed === controls.length) return { valid: true };

  const cycle = Array.from(inDegree.entries())
    .filter(([, deg]) => deg > 0)
    .map(([code]) => code);
  return { valid: false, cycle };
}
