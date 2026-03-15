import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../reports/templates/index.js";

describe("createDefaultRegistry", () => {
  it("registers all 10 templates", () => {
    const registry = createDefaultRegistry();
    const types = registry.list().map((t) => t.type).sort();
    expect(types).toEqual([
      "audit_evidence",
      "compliance_summary",
      "eu_ai_act_declaration_of_conformity",
      "eu_ai_act_instructions_for_use",
      "eu_ai_act_post_market_monitoring",
      "eu_ai_act_technical_documentation",
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
