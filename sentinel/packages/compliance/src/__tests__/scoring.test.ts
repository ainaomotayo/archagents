import { describe, it, expect } from "vitest";
import { scoreControl, scoreFramework, resolveVerdict } from "../scoring/engine.js";
import type { ControlDefinition, FindingInput } from "../types.js";

describe("scoreControl", () => {
  const control: ControlDefinition = {
    code: "CC6.1",
    name: "Access Controls",
    weight: 2.0,
    matchRules: [{ category: "vulnerability/*" }],
  };

  it("returns 1.0 when no findings match", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "dependency", severity: "low", category: "dependency/outdated", suppressed: false },
    ];
    expect(scoreControl(control, findings).score).toBe(1.0);
  });

  it("returns 0.0 when all findings match", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
    ];
    const result = scoreControl(control, findings);
    expect(result.score).toBe(0.0);
    expect(result.failing).toBe(1);
    expect(result.total).toBe(1);
  });

  it("returns 0.5 when half findings match", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
      { id: "f2", agentName: "dependency", severity: "low", category: "dependency/outdated", suppressed: false },
    ];
    expect(scoreControl(control, findings).score).toBe(0.5);
  });

  it("ignores suppressed findings", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: true },
    ];
    expect(scoreControl(control, findings).score).toBe(1.0);
  });
});

describe("scoreFramework", () => {
  it("computes weighted score with severity multipliers", () => {
    const controls: ControlDefinition[] = [
      { code: "C1", name: "Critical Control", weight: 3.0, matchRules: [{ severity: ["critical"] }] },
      { code: "C2", name: "Low Control", weight: 1.0, matchRules: [{ severity: ["low"] }] },
    ];
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "critical", category: "vuln/rce", suppressed: false },
      { id: "f2", agentName: "quality", severity: "low", category: "quality/style", suppressed: false },
    ];
    const result = scoreFramework(controls, findings);
    // C1: score=0.5 (1 match / 2 total), severity_mult=4 (critical), weight=3*4=12, weighted=12*0.5=6
    // C2: score=0.5 (1 match / 2 total), severity_mult=1 (low), weight=1*1=1, weighted=1*0.5=0.5
    // Total: 6.5 / 13 = 0.5
    expect(result.score).toBe(0.5);
    expect(result.verdict).toBe("non_compliant");
  });

  it("returns 1.0 for no findings", () => {
    const controls: ControlDefinition[] = [
      { code: "C1", name: "Test", weight: 1.0, matchRules: [{ severity: ["critical"] }] },
    ];
    const result = scoreFramework(controls, []);
    expect(result.score).toBe(1.0);
    expect(result.verdict).toBe("compliant");
  });

  it("handles mixed passing and failing controls", () => {
    const controls: ControlDefinition[] = [
      { code: "C1", name: "Failing", weight: 1.0, matchRules: [{ agent: "security" }] },
      { code: "C2", name: "Passing", weight: 1.0, matchRules: [{ agent: "nonexistent" }] },
    ];
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "high", category: "vuln/xss", suppressed: false },
    ];
    const result = scoreFramework(controls, findings);
    // C1: score=0 (1 match / 1 total), severity_mult=3 (high), weighted=1*3*0=0
    // C2: score=1.0 (0 match), severity_mult=1 (default), weighted=1*1*1=1
    // Total: 1 / (1*3 + 1*1) = 1/4 = 0.25
    expect(result.score).toBeCloseTo(0.25, 2);
    expect(result.verdict).toBe("non_compliant");
  });

  it("returns empty controlScores for no controls", () => {
    const result = scoreFramework([], []);
    expect(result.score).toBe(1.0);
    expect(result.controlScores).toEqual([]);
  });
});

describe("resolveVerdict", () => {
  it("returns compliant for >= 0.95", () => {
    expect(resolveVerdict(0.95)).toBe("compliant");
    expect(resolveVerdict(1.0)).toBe("compliant");
  });

  it("returns partially_compliant for >= 0.80", () => {
    expect(resolveVerdict(0.80)).toBe("partially_compliant");
    expect(resolveVerdict(0.94)).toBe("partially_compliant");
  });

  it("returns needs_remediation for >= 0.60", () => {
    expect(resolveVerdict(0.60)).toBe("needs_remediation");
    expect(resolveVerdict(0.79)).toBe("needs_remediation");
  });

  it("returns non_compliant for < 0.60", () => {
    expect(resolveVerdict(0.59)).toBe("non_compliant");
    expect(resolveVerdict(0.0)).toBe("non_compliant");
  });
});
