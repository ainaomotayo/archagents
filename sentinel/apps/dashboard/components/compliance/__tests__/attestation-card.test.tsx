import { describe, it, expect } from "vitest";
import { MOCK_ATTESTATIONS } from "@/lib/mock-data";

describe("AttestationCard data", () => {
  it("has attestations covering all statuses", () => {
    const statuses = new Set(MOCK_ATTESTATIONS.map((a) => a.status));
    expect(statuses.has("approved")).toBe(true);
    expect(statuses.has("pending_review")).toBe(true);
    expect(statuses.has("pending_approval")).toBe(true);
    expect(statuses.has("rejected")).toBe(true);
    expect(statuses.has("expired")).toBe(true);
    expect(statuses.has("draft")).toBe(true);
    expect(statuses.has("superseded")).toBe(true);
  });

  it("each attestation has required fields", () => {
    for (const a of MOCK_ATTESTATIONS) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.frameworkSlug).toBeTruthy();
      expect(a.controlCode).toBeTruthy();
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(1);
      expect(a.createdBy).toBeTruthy();
      expect(a.evidence.length).toBeGreaterThan(0);
    }
  });

  it("approved attestations have complete approvals", () => {
    const approved = MOCK_ATTESTATIONS.filter((a) => a.status === "approved");
    for (const a of approved) {
      const review = a.approvals.find((ap) => ap.stage === "review");
      const final = a.approvals.find((ap) => ap.stage === "final_approval");
      expect(review?.decision).toBe("approved");
      expect(final?.decision).toBe("approved");
    }
  });

  it("pending_review has a pending review approval", () => {
    const pending = MOCK_ATTESTATIONS.find((a) => a.status === "pending_review");
    expect(pending).toBeDefined();
    const review = pending!.approvals.find((ap) => ap.stage === "review");
    expect(review?.decision).toBe("pending");
  });

  it("detail page link would be correct", () => {
    const a = MOCK_ATTESTATIONS[0];
    const href = `/compliance/attestations/${a.id}`;
    expect(href).toBe(`/compliance/attestations/att-001`);
  });
});
