# NIST AI RMF + HIPAA Compliance Frameworks — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add NIST AI RMF 1.0 and HIPAA Security Rule as full regulatory compliance frameworks with attestation-gated scoring, gap analysis, remediation tracking, BAA registry, and extended agent detection rules.

**Architecture:** Extend the existing `packages/compliance/` type system with `requirementType`, `parentCode`, and `regulatoryStatus` fields. Add NIST and HIPAA as built-in framework definitions. Build attestation, gap analysis, remediation, and BAA services. Wire 15 new API endpoints. Extend 4 agents with 16 new detection rules. Add 2 new scheduler jobs and 2 new report templates.

**Tech Stack:** TypeScript (Vitest), Prisma, Fastify, React-PDF, Semgrep YAML, Python 3.12

---

### Task 1: Extend ControlDefinition Types

**Files:**
- Modify: `packages/compliance/src/types.ts`
- Test: `packages/compliance/src/__tests__/frameworks.test.ts`

**Step 1: Write the failing test**

Add to the existing `packages/compliance/src/__tests__/frameworks.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BUILT_IN_FRAMEWORKS } from "../frameworks/index.js";
import type { ControlDefinition } from "../types.js";

describe("ControlDefinition extended fields", () => {
  it("accepts requirementType field", () => {
    const control: ControlDefinition = {
      code: "TEST-1",
      name: "Test",
      weight: 1.0,
      matchRules: [],
      requirementType: "automated",
    };
    expect(control.requirementType).toBe("automated");
  });

  it("accepts all requirementType values", () => {
    const types: ControlDefinition["requirementType"][] = ["automated", "attestation", "hybrid"];
    expect(types).toHaveLength(3);
  });

  it("accepts parentCode field", () => {
    const control: ControlDefinition = {
      code: "GV-1.1",
      name: "Test",
      weight: 1.0,
      matchRules: [],
      requirementType: "attestation",
      parentCode: "GV-1",
    };
    expect(control.parentCode).toBe("GV-1");
  });

  it("accepts regulatoryStatus field", () => {
    const control: ControlDefinition = {
      code: "AS-1.1",
      name: "Test",
      weight: 3.0,
      matchRules: [],
      requirementType: "hybrid",
      regulatoryStatus: "required",
    };
    expect(control.regulatoryStatus).toBe("required");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/frameworks.test.ts`
Expected: FAIL — TypeScript error, `requirementType` does not exist on `ControlDefinition`

**Step 3: Write minimal implementation**

Edit `packages/compliance/src/types.ts`, change `ControlDefinition` interface:

```typescript
export interface ControlDefinition {
  code: string;
  name: string;
  weight: number;
  matchRules: MatchRule[];
  parentCode?: string;
  requirementType?: "automated" | "attestation" | "hybrid";
  attestationCadence?: number;
  regulatoryStatus?: "required" | "addressable";
  description?: string;
}
```

All new fields are optional (`?`) so existing 7 frameworks continue to work unchanged — they default to `undefined` which the scoring engine treats as `"automated"`.

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/frameworks.test.ts`
Expected: PASS

Also run: `npx turbo test --filter=@sentinel/compliance`
Expected: All existing tests still pass

**Step 5: Commit**

```bash
git add packages/compliance/src/types.ts packages/compliance/src/__tests__/frameworks.test.ts
git commit -m "feat(compliance): extend ControlDefinition with requirementType, parentCode, regulatoryStatus"
```

---

### Task 2: NIST AI RMF Framework Definition

**Files:**
- Create: `packages/compliance/src/frameworks/nist-ai-rmf.ts`
- Modify: `packages/compliance/src/frameworks/index.ts`
- Test: `packages/compliance/src/__tests__/nist-ai-rmf.test.ts`

**Step 1: Write the failing test**

Create `packages/compliance/src/__tests__/nist-ai-rmf.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { NIST_AI_RMF } from "../frameworks/nist-ai-rmf.js";

describe("NIST AI RMF framework", () => {
  it("has correct slug and metadata", () => {
    expect(NIST_AI_RMF.slug).toBe("nist-ai-rmf");
    expect(NIST_AI_RMF.name).toBe("NIST AI RMF 1.0");
    expect(NIST_AI_RMF.version).toBe("1.0");
    expect(NIST_AI_RMF.category).toBe("regulatory");
  });

  it("has 4 top-level functions", () => {
    const topLevelCodes = new Set(
      NIST_AI_RMF.controls.map((c) => c.code.split("-")[0]),
    );
    expect(topLevelCodes).toEqual(new Set(["GV", "MP", "MS", "MG"]));
  });

  it("has at least 60 controls", () => {
    expect(NIST_AI_RMF.controls.length).toBeGreaterThanOrEqual(60);
  });

  it("every control has a requirementType", () => {
    for (const c of NIST_AI_RMF.controls) {
      expect(["automated", "attestation", "hybrid"]).toContain(c.requirementType);
    }
  });

  it("every non-root control has a parentCode", () => {
    const codes = new Set(NIST_AI_RMF.controls.map((c) => c.code));
    for (const c of NIST_AI_RMF.controls) {
      if (c.parentCode) {
        // parentCode should reference another valid code OR be a function prefix
        const isValidParent = codes.has(c.parentCode) || /^(GV|MP|MS|MG)(-\d+)?$/.test(c.parentCode);
        expect(isValidParent).toBe(true);
      }
    }
  });

  it("weights are in range 1.0-3.0", () => {
    for (const c of NIST_AI_RMF.controls) {
      expect(c.weight).toBeGreaterThanOrEqual(1.0);
      expect(c.weight).toBeLessThanOrEqual(3.0);
    }
  });

  it("automated controls have at least one matchRule", () => {
    for (const c of NIST_AI_RMF.controls) {
      if (c.requirementType === "automated" || c.requirementType === "hybrid") {
        expect(c.matchRules.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("attestation-only controls have empty matchRules", () => {
    for (const c of NIST_AI_RMF.controls) {
      if (c.requirementType === "attestation") {
        expect(c.matchRules).toEqual([]);
      }
    }
  });

  it("has no duplicate control codes", () => {
    const codes = NIST_AI_RMF.controls.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/nist-ai-rmf.test.ts`
Expected: FAIL — cannot resolve `../frameworks/nist-ai-rmf.js`

**Step 3: Write the implementation**

Create `packages/compliance/src/frameworks/nist-ai-rmf.ts` with all 72 subcategories organized by function. Use the EU AI Act file as the structural template. Controls map to existing finding categories per the design doc (Section 3.2). Full file contents:

```typescript
import type { FrameworkDefinition } from "../types.js";

export const NIST_AI_RMF: FrameworkDefinition = {
  slug: "nist-ai-rmf",
  name: "NIST AI RMF 1.0",
  version: "1.0",
  category: "regulatory",
  controls: [
    // ===== GOVERN (GV) =====
    { code: "GV-1", name: "Policies for AI Risk Management", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-1.1", name: "Legal and Regulatory Requirements Identified", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1", description: "Legal and regulatory requirements involving AI are understood, managed, and documented." },
    { code: "GV-1.2", name: "Trustworthy AI Characteristics Integrated", weight: 2.5, matchRules: [{ agent: "quality", category: "quality/documentation*" }], requirementType: "hybrid", parentCode: "GV-1" },
    { code: "GV-1.3", name: "Risk Management Processes Established", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.4", name: "Ongoing Monitoring of AI Risks", weight: 2.0, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "GV-1" },
    { code: "GV-1.5", name: "Risk Management Processes Documented", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.6", name: "Risk Management Integrated into Business Processes", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },
    { code: "GV-1.7", name: "Mechanisms to Inventory AI Systems", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-1" },

    { code: "GV-2", name: "Accountability Structures", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-2.1", name: "Roles and Responsibilities Defined", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },
    { code: "GV-2.2", name: "Designated AI Risk Oversight Function", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },
    { code: "GV-2.3", name: "Executive Leadership Engagement", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-2" },

    { code: "GV-3", name: "Workforce Diversity and Culture", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-3.1", name: "Decision-Making Oversight Defined", weight: 2.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/oversight-gap*" }], requirementType: "hybrid", parentCode: "GV-3" },
    { code: "GV-3.2", name: "Policies for AI Training and Awareness", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-3" },

    { code: "GV-4", name: "Organizational Practices Monitored", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-4.1", name: "Organizational Monitoring for AI Risk", weight: 2.0, matchRules: [{ agent: "quality" }], requirementType: "hybrid", parentCode: "GV-4" },
    { code: "GV-4.2", name: "AI Risk Feedback Mechanisms", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-4" },
    { code: "GV-4.3", name: "Review and Update of Processes", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-4" },

    { code: "GV-5", name: "Engagement with External Stakeholders", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-5.1", name: "Data Governance Policies Established", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/data-governance*" }], requirementType: "hybrid", parentCode: "GV-5" },
    { code: "GV-5.2", name: "Stakeholder Feedback Incorporated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "GV-5" },

    { code: "GV-6", name: "Third-Party Risk Management", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "GV" },
    { code: "GV-6.1", name: "Policies Address Third-Party AI Risks", weight: 2.5, matchRules: [{ agent: "dependency", category: "dependency/ai-supply-chain*" }], requirementType: "hybrid", parentCode: "GV-6" },
    { code: "GV-6.2", name: "Contingency for Third-Party Failures", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "GV-6" },

    // ===== MAP (MP) =====
    { code: "MP-1", name: "Context and Use Cases", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-1.1", name: "Intended Purpose Defined", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.2", name: "Interdisciplinary AI Actors Identified", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.3", name: "Target Audience Defined", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },
    { code: "MP-1.4", name: "Usage Context Documented", weight: 1.5, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-1" },
    { code: "MP-1.5", name: "Assumptions and Limitations Documented", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-1" },
    { code: "MP-1.6", name: "Scientific Integrity and Reproducibility", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-1" },

    { code: "MP-2", name: "AI Categorization", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-2.1", name: "AI System Categorized by Risk Level", weight: 2.0, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "automated", parentCode: "MP-2" },
    { code: "MP-2.2", name: "Potential Harms Mapped", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-2" },
    { code: "MP-2.3", name: "Scientific Integrity Maintained", weight: 2.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/provenance*" }], requirementType: "hybrid", parentCode: "MP-2" },

    { code: "MP-3", name: "Benefits and Costs", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-3.1", name: "Benefits Assessed Against Costs", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.2", name: "Benefits and Costs for Affected Communities", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.3", name: "Benefits vs Potential Impacts Balanced", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },
    { code: "MP-3.4", name: "Impacts to Individuals Assessed", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP-3" },

    { code: "MP-4", name: "Risks and Impacts", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-4.1", name: "Benefits and Costs Documented", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }], requirementType: "hybrid", parentCode: "MP-4" },

    { code: "MP-5", name: "Impact Assessment", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MP" },
    { code: "MP-5.1", name: "Likelihood of Mapped Impacts Assessed", weight: 2.5, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MP-5" },
    { code: "MP-5.2", name: "Impact Likelihood Regularly Updated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MP-5" },

    // ===== MEASURE (MS) =====
    { code: "MS-1", name: "Measurement Approaches", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-1.1", name: "Measurement Approaches Applied", weight: 2.0, matchRules: [{ agent: "quality", category: "quality/ai-test-coverage*" }], requirementType: "hybrid", parentCode: "MS-1" },
    { code: "MS-1.2", name: "Participatory Methods in Measurement", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-1" },
    { code: "MS-1.3", name: "Internal and External Experts Consulted", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-1" },

    { code: "MS-2", name: "AI System Evaluation", weight: 3.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-2.1", name: "Valid and Reliable Output Evaluated", weight: 2.5, matchRules: [{ agent: "ai-detector" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.2", name: "AI Evaluated for Safety", weight: 3.0, matchRules: [{ category: "vulnerability/*" }, { agent: "ai-detector" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.3", name: "AI Evaluated for Fairness and Bias", weight: 3.0, matchRules: [{ agent: "ai-detector", category: "ai-detection/bias-indicator*" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.4", name: "AI Evaluated for Explainability", weight: 2.0, matchRules: [{ agent: "ai-detector" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.5", name: "AI Evaluated for Security", weight: 3.0, matchRules: [{ agent: "security" }, { category: "vulnerability/ai-input-validation*" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.6", name: "AI Evaluated for Resilience", weight: 2.5, matchRules: [{ agent: "security" }, { agent: "dependency" }], requirementType: "automated", parentCode: "MS-2" },
    { code: "MS-2.7", name: "AI Evaluated for Privacy", weight: 2.5, matchRules: [{ category: "vulnerability/phi-exposure*" }], requirementType: "hybrid", parentCode: "MS-2" },
    { code: "MS-2.8", name: "AI Transparency Assessed", weight: 2.5, matchRules: [{ agent: "quality", category: "quality/ai-documentation*" }, { category: "vulnerability/ai-transparency*" }], requirementType: "hybrid", parentCode: "MS-2" },

    { code: "MS-3", name: "Tracking Metrics", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-3.1", name: "Metrics Tracked Over Time", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },
    { code: "MS-3.2", name: "External Validation Methods", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },
    { code: "MS-3.3", name: "Feedback Loops Incorporated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-3" },

    { code: "MS-4", name: "Measurement Updates", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS" },
    { code: "MS-4.1", name: "Measurement Approaches Updated", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MS-4" },
    { code: "MS-4.2", name: "Methods Include Participatory Processes", weight: 1.0, matchRules: [], requirementType: "attestation", parentCode: "MS-4" },

    // ===== MANAGE (MG) =====
    { code: "MG-1", name: "Risk Treatment Plans", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-1.1", name: "Risk Treatment Plans in Place", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },
    { code: "MG-1.2", name: "Resources Allocated for Risk Treatment", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },
    { code: "MG-1.3", name: "Responses Prioritized by Impact", weight: 2.0, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MG-1" },
    { code: "MG-1.4", name: "Risk Treatment Mapped to Tolerance", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-1" },

    { code: "MG-2", name: "Risk Response", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-2.1", name: "Responses to Identified Risks Applied", weight: 2.5, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "hybrid", parentCode: "MG-2" },
    { code: "MG-2.2", name: "Incidents Documented", weight: 2.5, matchRules: [], requirementType: "automated", parentCode: "MG-2", description: "Covered by audit trail and evidence chain" },
    { code: "MG-2.3", name: "AI Risks Re-evaluated Regularly", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-2" },
    { code: "MG-2.4", name: "Escalation Processes in Place", weight: 2.0, matchRules: [], requirementType: "automated", parentCode: "MG-2", description: "Covered by approval workflow escalation" },

    { code: "MG-3", name: "Pre-Deployment Evaluation", weight: 3.0, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-3.1", name: "Pre-Deployment Risk Evaluated", weight: 3.0, matchRules: [{ severity: ["critical", "high", "medium"] }], requirementType: "automated", parentCode: "MG-3", description: "Covered by scan + approval gate pipeline" },
    { code: "MG-3.2", name: "Deployment Criteria Established", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-3" },

    { code: "MG-4", name: "Post-Deployment Monitoring", weight: 2.5, matchRules: [], requirementType: "attestation", parentCode: "MG" },
    { code: "MG-4.1", name: "Post-Deployment Monitoring in Place", weight: 2.5, matchRules: [{ severity: ["critical", "high"] }], requirementType: "hybrid", parentCode: "MG-4", description: "Scheduled scans + attestation of monitoring process" },
    { code: "MG-4.2", name: "Monitoring Results Applied", weight: 2.0, matchRules: [], requirementType: "attestation", parentCode: "MG-4" },
    { code: "MG-4.3", name: "Decommissioning Procedures", weight: 1.5, matchRules: [], requirementType: "attestation", parentCode: "MG-4" },
  ],
};
```

Register in `packages/compliance/src/frameworks/index.ts`:

```typescript
import { NIST_AI_RMF } from "./nist-ai-rmf.js";

// Add to BUILT_IN_FRAMEWORKS array:
export const BUILT_IN_FRAMEWORKS: FrameworkDefinition[] = [
  SOC2, ISO27001, EU_AI_ACT, SLSA, OPENSSF, CIS_SSC, GDPR, NIST_AI_RMF,
];
```

**Step 4: Run tests**

Run: `cd packages/compliance && npx vitest run src/__tests__/nist-ai-rmf.test.ts`
Expected: PASS (9 tests)

Run: `npx turbo test --filter=@sentinel/compliance`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/compliance/src/frameworks/nist-ai-rmf.ts packages/compliance/src/frameworks/index.ts packages/compliance/src/__tests__/nist-ai-rmf.test.ts
git commit -m "feat(compliance): add NIST AI RMF 1.0 framework with 72 controls"
```

---

### Task 3: HIPAA Security Rule Framework Definition

**Files:**
- Create: `packages/compliance/src/frameworks/hipaa.ts`
- Modify: `packages/compliance/src/frameworks/index.ts`
- Test: `packages/compliance/src/__tests__/hipaa.test.ts`

**Step 1: Write the failing test**

Create `packages/compliance/src/__tests__/hipaa.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { HIPAA } from "../frameworks/hipaa.js";

describe("HIPAA Security Rule framework", () => {
  it("has correct slug and metadata", () => {
    expect(HIPAA.slug).toBe("hipaa");
    expect(HIPAA.name).toBe("HIPAA Security Rule");
    expect(HIPAA.version).toBe("2013");
    expect(HIPAA.category).toBe("regulatory");
  });

  it("has 3 safeguard groups", () => {
    const prefixes = new Set(
      HIPAA.controls.map((c) => c.code.split("-")[0]),
    );
    expect(prefixes).toEqual(new Set(["AS", "PS", "TS"]));
  });

  it("has at least 50 controls", () => {
    expect(HIPAA.controls.length).toBeGreaterThanOrEqual(50);
  });

  it("every control has a requirementType", () => {
    for (const c of HIPAA.controls) {
      expect(["automated", "attestation", "hybrid"]).toContain(c.requirementType);
    }
  });

  it("every control has a regulatoryStatus", () => {
    for (const c of HIPAA.controls) {
      expect(["required", "addressable"]).toContain(c.regulatoryStatus);
    }
  });

  it("required controls have weight >= 2.0", () => {
    for (const c of HIPAA.controls) {
      if (c.regulatoryStatus === "required") {
        expect(c.weight).toBeGreaterThanOrEqual(2.0);
      }
    }
  });

  it("technical safeguard automated controls reference security agent", () => {
    const techAutoControls = HIPAA.controls.filter(
      (c) => c.code.startsWith("TS-") && c.requirementType === "automated",
    );
    expect(techAutoControls.length).toBeGreaterThanOrEqual(5);
    for (const c of techAutoControls) {
      const hasSecurityRule = c.matchRules.some(
        (r) => r.agent === "security" || r.category?.startsWith("vulnerability/"),
      );
      expect(hasSecurityRule).toBe(true);
    }
  });

  it("physical safeguards are all attestation", () => {
    const physical = HIPAA.controls.filter((c) => c.code.startsWith("PS-"));
    for (const c of physical) {
      expect(c.requirementType).toBe("attestation");
    }
  });

  it("has no duplicate control codes", () => {
    const codes = HIPAA.controls.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/hipaa.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `packages/compliance/src/frameworks/hipaa.ts` with all ~75 specs organized by safeguard. Follow the same pattern as NIST. Include `regulatoryStatus: "required" | "addressable"` on every control. Full implementation with Administrative (AS-*), Physical (PS-*), and Technical (TS-*) safeguards.

Register in `packages/compliance/src/frameworks/index.ts`:

```typescript
import { HIPAA } from "./hipaa.js";

export const BUILT_IN_FRAMEWORKS: FrameworkDefinition[] = [
  SOC2, ISO27001, EU_AI_ACT, SLSA, OPENSSF, CIS_SSC, GDPR, NIST_AI_RMF, HIPAA,
];
```

**Step 4: Run tests**

Run: `cd packages/compliance && npx vitest run src/__tests__/hipaa.test.ts`
Expected: PASS (9 tests)

Run: `npx turbo test --filter=@sentinel/compliance`
Expected: All tests pass

**Step 5: Commit**

```bash
git add packages/compliance/src/frameworks/hipaa.ts packages/compliance/src/frameworks/index.ts packages/compliance/src/__tests__/hipaa.test.ts
git commit -m "feat(compliance): add HIPAA Security Rule framework with 75 controls"
```

---

### Task 4: Database Schema — Attestation, BAA, Remediation Models + Migration

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260312100000_add_attestation_remediation_baa/migration.sql`

**Step 1: Add models to Prisma schema**

Add after the ApprovalDecision model in `packages/db/prisma/schema.prisma`:

```prisma
// --- Compliance Attestation & Remediation ---

model ControlAttestation {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @map("org_id") @db.Uuid
  frameworkSlug   String    @map("framework_slug")
  controlCode     String    @map("control_code")
  attestedBy      String    @map("attested_by")
  attestationType String    @map("attestation_type")
  justification   String
  evidenceUrls    String[]  @map("evidence_urls")
  validFrom       DateTime  @map("valid_from")
  expiresAt       DateTime  @map("expires_at")
  revokedAt       DateTime? @map("revoked_at")
  revokedBy       String?   @map("revoked_by")
  revokedReason   String?   @map("revoked_reason")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  history      AttestationHistory[]
  organization Organization @relation(fields: [orgId], references: [id])

  @@unique([orgId, frameworkSlug, controlCode])
  @@index([orgId, expiresAt])
  @@map("control_attestations")
}

model AttestationHistory {
  id             String   @id @default(uuid()) @db.Uuid
  attestationId  String   @map("attestation_id") @db.Uuid
  action         String
  actorId        String   @map("actor_id")
  previousState  Json?    @map("previous_state")
  createdAt      DateTime @default(now()) @map("created_at")

  attestation ControlAttestation @relation(fields: [attestationId], references: [id])

  @@index([attestationId])
  @@map("attestation_history")
}

model RemediationItem {
  id               String    @id @default(uuid()) @db.Uuid
  orgId            String    @map("org_id") @db.Uuid
  frameworkSlug    String    @map("framework_slug")
  controlCode      String    @map("control_code")
  title            String
  description      String
  status           String    @default("open")
  priority         String    @default("medium")
  assignedTo       String?   @map("assigned_to")
  dueDate          DateTime? @map("due_date")
  completedAt      DateTime? @map("completed_at")
  completedBy      String?   @map("completed_by")
  evidenceNotes    String?   @map("evidence_notes")
  linkedFindingIds String[]  @map("linked_finding_ids")
  createdBy        String    @map("created_by")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@index([orgId, frameworkSlug, status])
  @@index([orgId, dueDate])
  @@map("remediation_items")
}

model BusinessAssociateAgreement {
  id              String    @id @default(uuid()) @db.Uuid
  orgId           String    @map("org_id") @db.Uuid
  vendorName      String    @map("vendor_name")
  vendorContact   String    @map("vendor_contact")
  agreementDate   DateTime  @map("agreement_date")
  expiresAt       DateTime  @map("expires_at")
  documentUrl     String?   @map("document_url")
  status          String    @default("active")
  coveredServices String[]  @map("covered_services")
  reviewedBy      String    @map("reviewed_by")
  reviewedAt      DateTime  @map("reviewed_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])

  @@index([orgId, status])
  @@map("business_associate_agreements")
}
```

Add relation arrays to the Organization model:
```prisma
  controlAttestations        ControlAttestation[]
  remediationItems           RemediationItem[]
  businessAssociateAgreements BusinessAssociateAgreement[]
```

**Step 2: Write the migration SQL**

Create `packages/db/prisma/migrations/20260312100000_add_attestation_remediation_baa/migration.sql` with CREATE TABLE statements matching the schema. Follow the exact pattern from the approval workflow migration.

**Step 3: Verify schema**

Run: `npx turbo build --filter=@sentinel/db`
Expected: Build passes, Prisma client generates successfully

**Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260312100000_add_attestation_remediation_baa/
git commit -m "feat(db): add attestation, remediation, and BAA models with migration"
```

---

### Task 5: Attestation-Gated Scoring Engine

**Files:**
- Modify: `packages/compliance/src/scoring/engine.ts`
- Create: `packages/compliance/src/__tests__/attestation-scoring.test.ts`

**Step 1: Write the failing tests**

Create `packages/compliance/src/__tests__/attestation-scoring.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { scoreControlWithAttestation } from "../scoring/engine.js";
import type { ControlDefinition, FindingInput } from "../types.js";

const findings: FindingInput[] = [
  { id: "f1", agentName: "security", severity: "high", category: "vulnerability/xss", suppressed: false },
];

describe("scoreControlWithAttestation", () => {
  it("automated control scored from findings only", () => {
    const control: ControlDefinition = {
      code: "MS-2.5", name: "Security", weight: 3.0,
      matchRules: [{ agent: "security" }], requirementType: "automated",
    };
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBeLessThan(1.0);
    expect(result.attestationStatus).toBe("not_required");
  });

  it("attestation control with no attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("unattested");
  });

  it("attestation control with valid attestation scores by type", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(1.0);
    expect(result.attestationStatus).toBe("valid");
  });

  it("attestation control with expired attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() - 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("expired");
  });

  it("compensating_control attestation scores 0.8", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compensating_control",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.8);
  });

  it("planned_remediation attestation scores 0.3", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "planned_remediation",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.3);
  });

  it("not_applicable attestation excludes from scoring", () => {
    const control: ControlDefinition = {
      code: "PS-1.1", name: "Facility", weight: 1.5,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "not_applicable",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(1.0);
    expect(result.attestationStatus).toBe("not_applicable");
  });

  it("hybrid control requires both automated and attestation", () => {
    const control: ControlDefinition = {
      code: "GV-1.2", name: "Trustworthy AI", weight: 2.5,
      matchRules: [{ agent: "quality" }], requirementType: "hybrid",
    };
    // No quality findings match, so automated scores 1.0, but no attestation
    const result = scoreControlWithAttestation(control, findings, null);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("unattested");
  });

  it("hybrid control with both passing returns min", () => {
    const control: ControlDefinition = {
      code: "GV-1.2", name: "Trustworthy AI", weight: 2.5,
      matchRules: [{ agent: "quality" }], requirementType: "hybrid",
    };
    const attestation = {
      attestationType: "compensating_control",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: null,
    };
    // No quality findings → automated = 1.0, attestation = 0.8, min = 0.8
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0.8);
  });

  it("revoked attestation scores 0", () => {
    const control: ControlDefinition = {
      code: "GV-1.1", name: "Legal", weight: 2.0,
      matchRules: [], requirementType: "attestation",
    };
    const attestation = {
      attestationType: "compliant",
      expiresAt: new Date(Date.now() + 86400000),
      revokedAt: new Date(),
    };
    const result = scoreControlWithAttestation(control, findings, attestation);
    expect(result.score).toBe(0);
    expect(result.attestationStatus).toBe("revoked");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/attestation-scoring.test.ts`
Expected: FAIL — `scoreControlWithAttestation` not found

**Step 3: Write the implementation**

Add to `packages/compliance/src/scoring/engine.ts`:

```typescript
const ATTESTATION_TYPE_SCORES: Record<string, number> = {
  compliant: 1.0,
  not_applicable: 1.0,
  compensating_control: 0.8,
  planned_remediation: 0.3,
};

export interface AttestationInput {
  attestationType: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AttestationControlScore extends ControlScore {
  attestationStatus: "not_required" | "valid" | "expired" | "revoked" | "unattested" | "not_applicable";
}

export function scoreControlWithAttestation(
  control: ControlDefinition,
  allFindings: FindingInput[],
  attestation: AttestationInput | null,
): AttestationControlScore {
  const requirementType = control.requirementType ?? "automated";

  // Pure automated — existing behavior
  if (requirementType === "automated") {
    const cs = scoreControl(control, allFindings);
    return { ...cs, attestationStatus: "not_required" };
  }

  // Resolve attestation state
  const attestStatus = resolveAttestationStatus(attestation);

  // Pure attestation — score from attestation only
  if (requirementType === "attestation") {
    if (attestStatus === "not_applicable") {
      return { controlCode: control.code, score: 1.0, passing: 0, failing: 0, total: 0, attestationStatus: "not_applicable" };
    }
    if (attestStatus !== "valid") {
      return { controlCode: control.code, score: 0, passing: 0, failing: 0, total: 0, attestationStatus: attestStatus };
    }
    const typeScore = ATTESTATION_TYPE_SCORES[attestation!.attestationType] ?? 0;
    return { controlCode: control.code, score: typeScore, passing: 0, failing: 0, total: 0, attestationStatus: "valid" };
  }

  // Hybrid — min(automated, attestation)
  const cs = scoreControl(control, allFindings);
  if (attestStatus !== "valid") {
    return { ...cs, score: 0, attestationStatus: attestStatus };
  }
  const typeScore = ATTESTATION_TYPE_SCORES[attestation!.attestationType] ?? 0;
  return { ...cs, score: Math.min(cs.score, typeScore), attestationStatus: "valid" };
}

function resolveAttestationStatus(attestation: AttestationInput | null): "valid" | "expired" | "revoked" | "unattested" | "not_applicable" {
  if (!attestation) return "unattested";
  if (attestation.revokedAt) return "revoked";
  if (attestation.expiresAt < new Date()) return "expired";
  if (attestation.attestationType === "not_applicable") return "not_applicable";
  return "valid";
}
```

Export from `packages/compliance/src/index.ts`:

```typescript
export { scoreControlWithAttestation, type AttestationInput, type AttestationControlScore } from "./scoring/engine.js";
```

**Step 4: Run tests**

Run: `cd packages/compliance && npx vitest run src/__tests__/attestation-scoring.test.ts`
Expected: PASS (10 tests)

Run: `npx turbo test --filter=@sentinel/compliance`
Expected: All tests pass (existing + new)

**Step 5: Commit**

```bash
git add packages/compliance/src/scoring/engine.ts packages/compliance/src/index.ts packages/compliance/src/__tests__/attestation-scoring.test.ts
git commit -m "feat(compliance): add attestation-gated scoring with 4 attestation types"
```

---

### Task 6: Attestation Service

**Files:**
- Create: `packages/compliance/src/attestation/service.ts`
- Test: `packages/compliance/src/__tests__/attestation-service.test.ts`

Implement `AttestationService` with methods: `create(orgId, input)`, `renew(orgId, attestationId)`, `revoke(orgId, attestationId, reason, actorId)`, `getActive(orgId, frameworkSlug)`, `getExpiring(orgId, days)`. Each method writes to DB and creates `AttestationHistory` entries. Uses `withTenant` pattern.

Tests cover: create with valid input, create rejects short justification, renew resets expiry, revoke sets revokedAt, getExpiring returns correct results.

**Commit message:** `feat(compliance): add attestation service with CRUD and history tracking`

---

### Task 7: Gap Analysis Service

**Files:**
- Create: `packages/compliance/src/gap-analysis/service.ts`
- Test: `packages/compliance/src/__tests__/gap-analysis.test.ts`

Implement `computeGapAnalysis(framework, findings, attestations, remediations)` as a pure function (no DB). Takes a framework definition, findings, attestation map, and remediation map. Returns `GapAnalysis` with summary counts, prioritized gap items, and remediation plan stats. Gap severity derived from weight + regulatoryStatus.

Tests cover: all-compliant returns empty gaps, missing attestation shows as gap, expired attestation shows as gap, automated failure shows as gap, priority ordering correct, N/A controls excluded from gaps.

**Commit message:** `feat(compliance): add gap analysis computation with priority-based gap ranking`

---

### Task 8: Remediation Service

**Files:**
- Create: `packages/compliance/src/remediation/service.ts`
- Test: `packages/compliance/src/__tests__/remediation-service.test.ts`

Implement `RemediationService` with methods: `create(orgId, input)`, `update(orgId, id, input)`, `list(orgId, filters)`, `getOverdue(orgId)`. Status transitions: open → in_progress → completed | accepted_risk. Accepted_risk requires admin role.

Tests cover: create, update status, list by framework, overdue detection, accepted_risk validation.

**Commit message:** `feat(compliance): add remediation tracking service with overdue detection`

---

### Task 9: BAA Registry Service (HIPAA-specific)

**Files:**
- Create: `packages/compliance/src/baa/service.ts`
- Test: `packages/compliance/src/__tests__/baa-service.test.ts`

Implement `BAARegistryService` with methods: `register(orgId, input)`, `update(orgId, id, input)`, `terminate(orgId, id)`, `list(orgId)`, `getExpiring(orgId, days)`. Status transitions: active → expired | terminated.

Tests cover: register BAA, terminate BAA, list active, get expiring.

**Commit message:** `feat(compliance): add HIPAA BAA registry service`

---

### Task 10: API Routes — Attestations

**Files:**
- Create: `apps/api/src/routes/attestations.ts`
- Test: `apps/api/src/routes/attestations.test.ts`
- Modify: `apps/api/src/server.ts`

Build 5 endpoints: POST create, GET list, GET by id, DELETE revoke, GET expiring. All wrapped in `withTenant`, `authHook`, try-catch with proper status codes. Follows the exact pattern of `apps/api/src/routes/approvals.ts`.

Wire in server.ts with RBAC: create/renew = admin+manager, revoke = admin, read = admin+manager+developer.

Tests cover: all 5 endpoints with mock DB.

**Commit message:** `feat(api): add attestation CRUD API routes`

---

### Task 11: API Routes — Gap Analysis, Remediation, BAA

**Files:**
- Create: `apps/api/src/routes/gap-analysis.ts`
- Create: `apps/api/src/routes/remediations.ts`
- Create: `apps/api/src/routes/baa.ts`
- Test: `apps/api/src/routes/gap-analysis.test.ts`
- Test: `apps/api/src/routes/remediations.test.ts`
- Test: `apps/api/src/routes/baa.test.ts`
- Modify: `apps/api/src/server.ts`

Build remaining 10 endpoints. Gap analysis: GET compute + GET export. Remediations: POST create, GET list, PATCH update, GET overdue. BAA: POST register, GET list, PATCH update, DELETE terminate.

Wire in server.ts with RBAC per design doc.

Tests cover: each endpoint with mock DB.

**Commit message:** `feat(api): add gap analysis, remediation, and BAA API routes`

---

### Task 12: RBAC Permissions for New Endpoints

**Files:**
- Modify: `packages/security/src/rbac.ts`

Add 15 new permission entries for all new endpoints. Follow the existing pattern (array of `{ method, path, roles }`).

Run: `npx turbo test --filter=@sentinel/security`
Expected: All tests pass

**Commit message:** `feat(security): register RBAC permissions for attestation, remediation, and BAA endpoints`

---

### Task 13: Scheduler Jobs — Attestation Expiry and Remediation Overdue

**Files:**
- Create: `apps/api/src/scheduler/jobs/attestation-expiry.ts`
- Create: `apps/api/src/scheduler/jobs/remediation-overdue.ts`
- Modify: `apps/api/src/scheduler/index.ts`
- Test: `apps/api/src/scheduler/__tests__/jobs-attestation.test.ts`
- Test: `apps/api/src/scheduler/__tests__/jobs-remediation.test.ts`

**AttestationExpiryJob**: `"0 6 * * *"`, tier critical, queries attestations expiring in 14 days → publish notification, queries expired today → mark expired + publish notification. Also checks BAAs expiring in 30 days.

**RemediationOverdueJob**: `"30 6 * * *"`, tier standard, queries remediations past dueDate → publish escalation notification.

Register both in scheduler/index.ts alongside existing jobs.

Tests cover: expiry detection, notification publishing, BAA expiry, remediation overdue.

**Commit message:** `feat(scheduler): add attestation expiry and remediation overdue sweep jobs`

---

### Task 14: Extend Compliance Snapshot Job for 9 Frameworks

**Files:**
- Modify: `apps/api/src/scheduler/jobs/compliance-snapshot.ts`

The snapshot job already iterates `BUILT_IN_FRAMEWORKS`. Since Tasks 2-3 added NIST and HIPAA to `BUILT_IN_FRAMEWORKS`, the snapshot job automatically scores them. **No code change needed** — just verify.

Run: `npx turbo test --filter=@sentinel/api`
Expected: All tests pass

**Commit message:** (no commit — verified, no changes needed)

---

### Task 15: Report Templates — NIST CSF Profile and HIPAA Assessment

**Files:**
- Create: `packages/compliance/src/reports/NistProfileReport.tsx`
- Create: `packages/compliance/src/reports/HipaaAssessmentReport.tsx`
- Modify: `packages/compliance/src/reports/generator.ts`
- Modify: `packages/compliance/src/index.ts`
- Test: `packages/compliance/src/__tests__/nist-hipaa-reports.test.ts`

Follow the existing React-PDF pattern from `ComplianceSummaryReport.tsx`. Each report is a React component that accepts typed data props and renders a PDF.

Add to generator.ts:
```typescript
export async function generateNistProfilePdf(data: NistProfileData): Promise<Buffer> {
  return renderToBuffer(createElement(NistProfileReport, { data }) as any) as Promise<Buffer>;
}
export async function generateHipaaAssessmentPdf(data: HipaaAssessmentData): Promise<Buffer> {
  return renderToBuffer(createElement(HipaaAssessmentReport, { data }) as any) as Promise<Buffer>;
}
```

Add `"nist_profile"` and `"hipaa_assessment"` to `VALID_REPORT_TYPES`.

Tests verify PDF generation returns a Buffer with non-zero length.

**Commit message:** `feat(compliance): add NIST CSF Profile and HIPAA Assessment report templates`

---

### Task 16: Security Agent Semgrep Rules

**Files:**
- Create: `agents/security/sentinel_security/rules/hipaa-phi-exposure.yaml`
- Create: `agents/security/sentinel_security/rules/hipaa-encryption.yaml`
- Create: `agents/security/sentinel_security/rules/hipaa-auth-controls.yaml`
- Create: `agents/security/sentinel_security/rules/hipaa-audit-logging.yaml`
- Create: `agents/security/sentinel_security/rules/nist-transparency.yaml`
- Create: `agents/security/sentinel_security/rules/nist-input-validation.yaml`
- Test: `agents/security/tests/test_hipaa_rules.py`
- Test: `agents/security/tests/test_nist_rules.py`

Each YAML file follows Semgrep rule format. Example for PHI exposure:

```yaml
rules:
  - id: hipaa-phi-exposure-logging
    pattern-either:
      - pattern: logger.$METHOD(..., $VAR, ...)
      - pattern: console.$METHOD(..., $VAR, ...)
    metavariable-regex:
      metavariable: $VAR
      regex: (ssn|social_security|date_of_birth|dob|mrn|medical_record|diagnosis|patient_id|health_plan|beneficiary)
    message: "Potential PHI exposure in log output: $VAR"
    severity: ERROR
    metadata:
      category: vulnerability/phi-exposure
      hipaa: "§164.312(e)(1)"
```

Python tests use temporary files with positive/negative samples, run Semgrep, assert findings.

**Commit message:** `feat(security-agent): add HIPAA and NIST Semgrep rules for PHI, encryption, auth, and AI transparency`

---

### Task 17: Quality, Dependency, and AI-Detector Agent Extensions

**Files:**
- Modify: `agents/quality/sentinel_quality/` (add 4 check functions)
- Modify: `agents/dependency/sentinel_dependency/` (add 3 detection functions)
- Modify: `agents/ai-detector/sentinel_aidetector/` (add 3 detection functions)
- Test files in each agent's `tests/` directory

Each extension adds new detection functions that emit findings with the new categories defined in the design doc. Each finding follows the existing `Finding` type from `sentinel_agents.types`.

Quality agent checks for AI documentation presence, data governance markers, AI test coverage, and access control documentation.

Dependency agent checks for HIPAA-relevant CVEs (CWE-311, CWE-306, CWE-532), AI supply chain risks, and PHI license compatibility.

AI-detector agent checks for model provenance metadata, bias indicators, and human oversight gaps.

**Commit message:** `feat(agents): extend quality, dependency, and ai-detector agents with NIST/HIPAA detection rules`

---

### Task 18: Integration Verification and Package Exports

**Step 1: Run full test suite**

Run: `npx turbo build test`
Expected: All builds pass, all tests pass

**Step 2: Verify framework registration**

Run a quick script or test that imports `BUILT_IN_FRAMEWORKS` and verifies length is 9 and slugs include `nist-ai-rmf` and `hipaa`.

**Step 3: Commit any final wiring**

```bash
git commit -m "chore: final integration wiring and export verification"
```

---

## Execution Order and Dependencies

```
Task 1 (types) ──► Task 2 (NIST) ──► Task 3 (HIPAA) ──► Task 14 (verify snapshot)
                                                │
Task 4 (DB schema) ──────────────────────────────┤
                                                │
Task 5 (scoring) ◄── Task 1                     │
                                                │
Task 6 (attestation svc) ◄── Task 4, 5          │
Task 7 (gap analysis svc) ◄── Task 5, 6         │
Task 8 (remediation svc) ◄── Task 4             │
Task 9 (BAA svc) ◄── Task 4                     │
                                                │
Task 10 (attest routes) ◄── Task 6              │
Task 11 (gap/remed/baa routes) ◄── Task 7,8,9   │
Task 12 (RBAC) ◄── Task 10, 11                  │
Task 13 (scheduler jobs) ◄── Task 6, 8, 9       │
Task 15 (reports) ◄── Task 2, 3, 5              │
                                                │
Task 16 (semgrep rules) — independent            │
Task 17 (agent extensions) — independent         │
                                                │
Task 18 (integration) ◄── ALL                   ▼
```

**Parallelizable batches:**
- Batch 1: Tasks 1, 4 (types + DB — independent foundations)
- Batch 2: Tasks 2, 3, 5 (frameworks + scoring — depend on types)
- Batch 3: Tasks 6, 7, 8, 9 (services — depend on DB + scoring)
- Batch 4: Tasks 10, 11, 12, 13 (API + scheduler — depend on services)
- Batch 5: Tasks 15, 16, 17 (reports + agents — independent of API)
- Batch 6: Task 18 (integration — depends on all)
