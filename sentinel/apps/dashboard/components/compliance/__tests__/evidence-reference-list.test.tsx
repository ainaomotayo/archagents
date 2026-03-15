import { describe, it, expect } from "vitest";
import { MOCK_ATTESTATIONS } from "@/lib/mock-data";

describe("EvidenceReferenceList data", () => {
  it("all attestations have at least one evidence item", () => {
    for (const a of MOCK_ATTESTATIONS) {
      expect(a.evidence.length).toBeGreaterThan(0);
    }
  });

  it("approved attestations have auto-snapshot evidence", () => {
    const approved = MOCK_ATTESTATIONS.filter((a) => a.status === "approved");
    for (const a of approved) {
      const snapshot = a.evidence.find((e) => e.type === "snapshot");
      expect(snapshot).toBeDefined();
    }
  });

  it("evidence items have required fields", () => {
    for (const a of MOCK_ATTESTATIONS) {
      for (const ev of a.evidence) {
        expect(ev.id).toBeTruthy();
        expect(ev.type).toBeTruthy();
        expect(ev.title).toBeTruthy();
        expect(ev.attestationId).toBe(a.id);
      }
    }
  });

  it("URL evidence items have url field", () => {
    const urlEvidence = MOCK_ATTESTATIONS.flatMap((a) =>
      a.evidence.filter((e) => e.type === "url"),
    );
    expect(urlEvidence.length).toBeGreaterThan(0);
    for (const ev of urlEvidence) {
      expect(ev.url).toBeTruthy();
    }
  });

  it("ticket evidence items have refId field", () => {
    const ticketEvidence = MOCK_ATTESTATIONS.flatMap((a) =>
      a.evidence.filter((e) => e.type === "ticket"),
    );
    expect(ticketEvidence.length).toBeGreaterThan(0);
    for (const ev of ticketEvidence) {
      expect(ev.refId).toBeTruthy();
    }
  });

  it("snapshot evidence is non-removable (type check)", () => {
    const snapshotEvidence = MOCK_ATTESTATIONS.flatMap((a) =>
      a.evidence.filter((e) => e.type === "snapshot"),
    );
    for (const ev of snapshotEvidence) {
      expect(ev.type).toBe("snapshot");
    }
  });
});
