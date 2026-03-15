import { describe, it, expect } from "vitest";
import { MOCK_ATTESTATION_OVERRIDES, MOCK_FRAMEWORK_SCORES } from "@/lib/mock-data";
import { scoreToColor } from "../types";

describe("Heatmap attestation integration", () => {
  it("override data has required fields", () => {
    for (const o of MOCK_ATTESTATION_OVERRIDES) {
      expect(o.frameworkSlug).toBeTruthy();
      expect(o.controlCode).toBeTruthy();
      expect(o.score).toBeGreaterThanOrEqual(0);
      expect(o.score).toBeLessThanOrEqual(1);
      expect(o.attestationId).toBeTruthy();
      expect(o.expiresAt).toBeTruthy();
    }
  });

  it("attested score overrides automated score for cell color", () => {
    const override = MOCK_ATTESTATION_OVERRIDES.find(
      (o) => o.frameworkSlug === "soc2" && o.controlCode === "CC6.1",
    );
    expect(override).toBeDefined();

    const fw = MOCK_FRAMEWORK_SCORES.find((f) => f.frameworkSlug === "soc2");
    const ctrl = fw?.controlScores.find((c) => c.controlCode === "CC6.1");
    expect(ctrl).toBeDefined();

    const automatedColor = scoreToColor(ctrl!.score);
    const attestedColor = scoreToColor(override!.score);

    expect(automatedColor).toBe("orange"); // 0.72 is >= 0.60 but < 0.80
    expect(attestedColor).toBe("green"); // 0.95
  });

  it("override map correctly keys by framework:control", () => {
    const overrideMap = new Map(
      MOCK_ATTESTATION_OVERRIDES.map((o) => [
        `${o.frameworkSlug}:${o.controlCode}`,
        o,
      ]),
    );

    expect(overrideMap.get("soc2:CC6.1")).toBeDefined();
    expect(overrideMap.get("slsa:SL4")).toBeDefined();
    expect(overrideMap.get("soc2:CC1.1")).toBeUndefined();
  });

  it("only approved non-expired attestations are in overrides", () => {
    expect(MOCK_ATTESTATION_OVERRIDES.length).toBe(2);
    for (const o of MOCK_ATTESTATION_OVERRIDES) {
      const expiresAt = new Date(o.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("ControlDetailPanel can compute attestation info from override", () => {
    const override = MOCK_ATTESTATION_OVERRIDES[0];
    const fw = MOCK_FRAMEWORK_SCORES.find((f) => f.frameworkSlug === override.frameworkSlug);
    const ctrl = fw?.controlScores.find((c) => c.controlCode === override.controlCode);

    const attestationInfo = {
      attestationId: override.attestationId,
      attestedScore: override.score,
      automatedScore: ctrl!.score,
      expiresAt: override.expiresAt,
    };

    expect(attestationInfo.attestedScore).toBe(0.95);
    expect(attestationInfo.automatedScore).toBe(0.72);
    expect(attestationInfo.attestationId).toBe("att-001");
  });
});
