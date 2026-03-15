import { describe, it, expect } from "vitest";
import { euAiActRegistry } from "../wizard/handlers/index.js";
import { EU_AI_ACT_CONTROLS } from "../wizard/eu-ai-act-controls.js";

describe("Wizard step handlers", () => {
  it("has all 12 handlers registered", () => {
    expect(euAiActRegistry.getAll()).toHaveLength(12);
  });

  for (const control of EU_AI_ACT_CONTROLS) {
    describe(control.code, () => {
      it("is registered in the registry", () => {
        expect(euAiActRegistry.has(control.code)).toBe(true);
      });

      it("getRequirements returns non-empty array matching control definition", () => {
        const handler = euAiActRegistry.get(control.code);
        const reqs = handler.getRequirements();
        expect(reqs.length).toBe(control.requirements.length);
        expect(reqs.map((r) => r.key)).toEqual(control.requirements.map((r) => r.key));
      });

      it("validate returns invalid when no requirements completed", () => {
        const handler = euAiActRegistry.get(control.code);
        const reqs = handler.getRequirements(); // all completed=false
        const result = handler.validate(reqs);
        const hasRequired = reqs.some((r) => !r.optional);
        if (hasRequired) {
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
        } else {
          expect(result.valid).toBe(true);
        }
      });

      it("validate returns valid when all non-optional completed", () => {
        const handler = euAiActRegistry.get(control.code);
        const reqs = handler.getRequirements().map((r) => ({
          ...r,
          completed: r.optional ? false : true,
        }));
        expect(handler.validate(reqs).valid).toBe(true);
      });

      it("getGuidance returns non-empty string", () => {
        const handler = euAiActRegistry.get(control.code);
        expect(handler.getGuidance().length).toBeGreaterThan(10);
      });
    });
  }

  it("throws for unknown control code", () => {
    expect(() => euAiActRegistry.get("UNKNOWN")).toThrow(/No handler/);
  });
});
