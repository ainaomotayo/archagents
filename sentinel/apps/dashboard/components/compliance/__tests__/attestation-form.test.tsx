import { describe, it, expect } from "vitest";
import { defaultTTLDays, buildSnapshot } from "../attestation-types";
import { MOCK_FRAMEWORK_SCORES } from "@/lib/mock-data";

describe("AttestationForm logic", () => {
  describe("buildSnapshot", () => {
    it("builds snapshot from framework scores", () => {
      const snap = buildSnapshot(MOCK_FRAMEWORK_SCORES, "soc2", "CC6.1", null);
      expect(snap).not.toBeNull();
      expect(snap!.controlScore).toBe(0.72);
      expect(snap!.frameworkScore).toBe(0.82);
      expect(snap!.passing).toBe(18);
      expect(snap!.failing).toBe(7);
      expect(snap!.total).toBe(25);
      expect(snap!.certificateId).toBeNull();
      expect(snap!.capturedAt).toBeTruthy();
    });

    it("includes certificate info when provided", () => {
      const cert = { id: "cert-123", status: "active", riskScore: 12 };
      const snap = buildSnapshot(MOCK_FRAMEWORK_SCORES, "soc2", "CC6.1", cert);
      expect(snap!.certificateId).toBe("cert-123");
      expect(snap!.certificateStatus).toBe("active");
      expect(snap!.scanRiskScore).toBe(12);
    });

    it("returns null for unknown framework", () => {
      const snap = buildSnapshot(MOCK_FRAMEWORK_SCORES, "nonexistent", "CC6.1", null);
      expect(snap).toBeNull();
    });

    it("returns null for unknown control", () => {
      const snap = buildSnapshot(MOCK_FRAMEWORK_SCORES, "soc2", "NONEXISTENT", null);
      expect(snap).toBeNull();
    });
  });

  describe("score validation", () => {
    it("score must be between 0 and 1", () => {
      const validScores = [0, 0.5, 0.95, 1.0];
      for (const s of validScores) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("expiry defaults", () => {
    it("SOC 2 defaults to 90 days", () => {
      expect(defaultTTLDays("soc2")).toBe(90);
    });

    it("ISO 27001 defaults to 180 days", () => {
      expect(defaultTTLDays("iso27001")).toBe(180);
    });

    it("GDPR defaults to 365 days", () => {
      expect(defaultTTLDays("gdpr")).toBe(365);
    });

    it("computed expiry date is correct", () => {
      const ttl = defaultTTLDays("soc2");
      const now = new Date();
      const expiry = new Date(now);
      expiry.setDate(expiry.getDate() + ttl);
      const diff = Math.round((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      expect(diff).toBe(90);
    });
  });
});
