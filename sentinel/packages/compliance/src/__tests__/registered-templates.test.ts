import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../reports/templates/index.js";

describe("createDefaultRegistry", () => {
  it("registers all 6 templates", () => {
    const registry = createDefaultRegistry();
    const types = registry.list().map((t) => t.type).sort();
    expect(types).toEqual([
      "audit_evidence",
      "compliance_summary",
      "executive",
      "hipaa_assessment",
      "ip_attribution",
      "nist_profile",
    ]);
  });

  it("each template has displayName and description", () => {
    const registry = createDefaultRegistry();
    for (const t of registry.list()) {
      expect(t.displayName).toBeTruthy();
      expect(t.description).toBeTruthy();
    }
  });
});
