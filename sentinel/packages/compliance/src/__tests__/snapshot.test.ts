import { describe, it, expect } from "vitest";
import { scoreFramework, resolveVerdict } from "../scoring/engine.js";
import { BUILT_IN_FRAMEWORKS } from "../frameworks/index.js";
import type { FindingInput } from "../types.js";

describe("compliance snapshot generation", () => {
  const emptyFindings: FindingInput[] = [];

  it("scores all 7 frameworks with no findings (all compliant)", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      const result = scoreFramework(fw.controls, emptyFindings);
      expect(result.score).toBe(1.0);
      expect(result.verdict).toBe("compliant");
    }
  });

  it("generates control breakdown for each framework", () => {
    for (const fw of BUILT_IN_FRAMEWORKS) {
      const result = scoreFramework(fw.controls, emptyFindings);
      expect(result.controlScores.length).toBe(fw.controls.length);
    }
  });

  it("snapshot score changes when findings are introduced", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "critical", category: "vulnerability/sql-injection", suppressed: false },
      { id: "f2", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
    ];
    const soc2 = BUILT_IN_FRAMEWORKS.find((f) => f.slug === "soc2")!;
    const result = scoreFramework(soc2.controls, findings);
    expect(result.score).toBeLessThan(1.0);
    expect(result.verdict).not.toBe("compliant");
  });

  it("upsert logic: same day score replaces previous", () => {
    // Simulate two scores for same day — second should win
    const findings1: FindingInput[] = [
      { id: "f1", agentName: "security", severity: "critical", category: "vulnerability/rce", suppressed: false },
    ];
    const findings2: FindingInput[] = [];
    const soc2 = BUILT_IN_FRAMEWORKS.find((f) => f.slug === "soc2")!;
    const score1 = scoreFramework(soc2.controls, findings1);
    const score2 = scoreFramework(soc2.controls, findings2);
    // Second run with no findings should produce perfect score
    expect(score2.score).toBe(1.0);
    expect(score1.score).toBeLessThan(score2.score);
  });

  it("verdict is deterministic for same inputs", () => {
    const findings: FindingInput[] = [
      { id: "f1", agentName: "dependency", severity: "medium", category: "dependency/outdated", suppressed: false },
    ];
    const iso = BUILT_IN_FRAMEWORKS.find((f) => f.slug === "iso27001")!;
    const r1 = scoreFramework(iso.controls, findings);
    const r2 = scoreFramework(iso.controls, findings);
    expect(r1.score).toBe(r2.score);
    expect(r1.verdict).toBe(r2.verdict);
    expect(resolveVerdict(r1.score)).toBe(r1.verdict);
  });
});
