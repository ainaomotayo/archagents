# AI Decision Trace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured per-signal confidence decomposition and tool provenance to AI detector findings, with a dedicated `DecisionTrace` model, API endpoints, and dashboard UI.

**Architecture:** The AI detector agent builds a `TraceBuilder` that produces structured `extra.trace` data. The compliance package provides pure extraction functions and a `DecisionTraceService`. Two new API endpoints expose traces. The finding detail page renders a trace card with signal contribution bars.

**Tech Stack:** Python 3.12 (agent), TypeScript/Prisma (API + compliance), Next.js 15 + React (dashboard), Vitest (TS tests), pytest (Python tests)

---

### Task 1: Python TraceBuilder dataclass

**Files:**
- Create: `agents/ai-detector/sentinel_aidetector/trace.py`
- Test: `agents/ai-detector/tests/test_trace.py`

**Step 1: Write the failing test**

Create `agents/ai-detector/tests/test_trace.py`:

```python
from sentinel_aidetector.trace import SignalDetail, TraceBuilder


def test_overall_score_sums_contributions():
    tb = TraceBuilder(
        entropy=SignalDetail(weight=0.25, raw_value=3.0, probability=0.8, contribution=0.20),
        uniformity=SignalDetail(weight=0.20, raw_value=0.6, probability=0.6, contribution=0.12),
        markers=SignalDetail(weight=0.35, raw_value=2.0, probability=0.8, contribution=0.28),
        timing=SignalDetail(weight=0.20, raw_value=50.0, probability=0.5, contribution=0.10),
    )
    assert abs(tb.overall_score() - 0.70) < 0.01


def test_overall_score_clamps_to_1():
    tb = TraceBuilder(
        entropy=SignalDetail(weight=0.25, raw_value=1.0, probability=1.0, contribution=0.9),
        markers=SignalDetail(weight=0.35, raw_value=5.0, probability=1.0, contribution=0.9),
    )
    assert tb.overall_score() == 1.0


def test_overall_score_empty_signals():
    tb = TraceBuilder()
    assert tb.overall_score() == 0.0


def test_to_signals_dict_uses_camel_case():
    tb = TraceBuilder(
        entropy=SignalDetail(
            weight=0.25, raw_value=3.5, probability=0.8, contribution=0.20,
            detail={"tokenEntropy": 3.2, "structureEntropy": 4.0, "namingEntropy": 3.3},
        ),
    )
    d = tb.to_signals_dict()
    assert "entropy" in d
    sig = d["entropy"]
    assert sig["rawValue"] == 3.5  # camelCase, not raw_value
    assert sig["weight"] == 0.25
    assert sig["probability"] == 0.8
    assert sig["contribution"] == 0.20
    assert sig["detail"]["tokenEntropy"] == 3.2


def test_to_extra_nests_under_trace():
    tb = TraceBuilder(
        tool_name="copilot",
        prompt_category="code-completion",
        entropy=SignalDetail(weight=0.25, raw_value=3.0, probability=0.8, contribution=0.20),
    )
    extra = tb.to_extra()
    assert "trace" in extra
    trace = extra["trace"]
    assert trace["toolName"] == "copilot"
    assert trace["promptCategory"] == "code-completion"
    assert trace["promptHash"] is None
    assert abs(trace["overallScore"] - 0.20) < 0.01
    assert "entropy" in trace["signals"]


def test_to_signals_dict_omits_none_signals():
    tb = TraceBuilder(
        markers=SignalDetail(weight=0.35, raw_value=1.0, probability=0.4, contribution=0.14),
    )
    d = tb.to_signals_dict()
    assert "markers" in d
    assert "entropy" not in d
    assert "uniformity" not in d
    assert "timing" not in d
```

**Step 2: Run test to verify it fails**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/test_trace.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'sentinel_aidetector.trace'`

**Step 3: Write minimal implementation**

Create `agents/ai-detector/sentinel_aidetector/trace.py`:

```python
"""Structured trace builder for AI detection findings.

Produces a nested `extra.trace` dict with per-signal confidence
decomposition. Keys use camelCase for TypeScript compatibility.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class SignalDetail:
    """A single detection signal's contribution to the overall score."""

    weight: float
    raw_value: float
    probability: float
    contribution: float  # weight * probability
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass
class TraceBuilder:
    """Builds a structured decision trace for an AI detection finding."""

    tool_name: str | None = None
    prompt_hash: str | None = None
    prompt_category: str | None = None

    entropy: SignalDetail | None = None
    uniformity: SignalDetail | None = None
    markers: SignalDetail | None = None
    timing: SignalDetail | None = None

    def overall_score(self) -> float:
        """Sum contributions from all signals, clamped to [0, 1]."""
        total = 0.0
        for sig in [self.entropy, self.uniformity, self.markers, self.timing]:
            if sig:
                total += sig.contribution
        return max(0.0, min(1.0, total))

    def to_signals_dict(self) -> dict[str, Any]:
        """Serialize to the signals JSON shape matching TypeScript TraceSignals.

        Uses camelCase keys for cross-language compatibility.
        """
        result: dict[str, Any] = {}
        for name in ["entropy", "uniformity", "markers", "timing"]:
            sig = getattr(self, name)
            if sig is not None:
                result[name] = {
                    "weight": sig.weight,
                    "rawValue": sig.raw_value,
                    "probability": sig.probability,
                    "contribution": sig.contribution,
                    "detail": sig.detail,
                }
        return result

    def to_extra(self) -> dict[str, Any]:
        """Produce the finding.extra dict with trace nested under 'trace' key."""
        return {
            "trace": {
                "toolName": self.tool_name,
                "promptHash": self.prompt_hash,
                "promptCategory": self.prompt_category,
                "overallScore": self.overall_score(),
                "signals": self.to_signals_dict(),
            }
        }
```

**Step 4: Run test to verify it passes**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/test_trace.py -v`
Expected: 6 PASSED

**Step 5: Commit**

```bash
git add agents/ai-detector/sentinel_aidetector/trace.py agents/ai-detector/tests/test_trace.py
git commit -m "feat(ai-detector): add TraceBuilder dataclass for decision trace"
```

---

### Task 2: Integrate TraceBuilder into AIDetectorAgent

**Files:**
- Modify: `agents/ai-detector/sentinel_aidetector/agent.py:1-196`
- Test: `agents/ai-detector/tests/test_agent.py` (existing, verify no regressions)

**Step 1: Add import and replace extra dict**

In `agents/ai-detector/sentinel_aidetector/agent.py`:

1. Add import at line 9 (after existing imports):
   ```python
   from sentinel_aidetector.trace import SignalDetail, TraceBuilder
   ```

2. Replace lines 161-173 (the `extra={...}` block inside the `Finding` constructor) with:
   ```python
                extra=TraceBuilder(
                    tool_name=marker_tools[0] if marker_tools else None,
                    entropy=SignalDetail(
                        weight=_WEIGHT_ENTROPY,
                        raw_value=round(entropy, 3),
                        probability=round(entropy_prob, 3),
                        contribution=round(_WEIGHT_ENTROPY * entropy_prob, 4),
                        detail={
                            "tokenEntropy": round(ast_entropy.token_entropy, 3),
                            "structureEntropy": round(ast_entropy.structure_entropy, 3),
                            "namingEntropy": round(ast_entropy.naming_entropy, 3),
                        },
                    ),
                    uniformity=SignalDetail(
                        weight=_WEIGHT_UNIFORMITY,
                        raw_value=round(uniformity, 3),
                        probability=round(uniformity, 3),
                        contribution=round(_WEIGHT_UNIFORMITY * uniformity, 4),
                    ),
                    markers=SignalDetail(
                        weight=_WEIGHT_MARKERS,
                        raw_value=len(marker_matches),
                        probability=round(marker_prob, 3),
                        contribution=round(_WEIGHT_MARKERS * marker_prob, 4),
                        detail={
                            "tools": marker_tools,
                            "matchCount": len(marker_matches),
                        },
                    ),
                    timing=SignalDetail(
                        weight=_WEIGHT_TIMING,
                        raw_value=timing_signal.lines_changed,
                        probability=round(timing_signal.probability, 3),
                        contribution=round(_WEIGHT_TIMING * timing_signal.probability, 4),
                        detail={
                            "linesChanged": timing_signal.lines_changed,
                            "isBurst": timing_signal.is_burst,
                            "sizeUniformity": round(timing_signal.size_uniformity, 3),
                        },
                    ),
                ).to_extra(),
   ```

**Step 2: Run existing tests to verify no regressions**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/ -v`
Expected: All existing tests pass. The `extra` field shape changed from flat to nested `{trace: {...}}`, but existing tests that check `extra` fields need updating.

**Step 3: Update test assertions for new extra shape**

In `agents/ai-detector/tests/test_agent.py`, find any assertions on `finding.extra["ai_probability"]` or similar flat keys. These must change to `finding.extra["trace"]["overallScore"]` and `finding.extra["trace"]["signals"]["entropy"]` etc.

For each assertion like:
```python
assert finding.extra["ai_probability"] > 0
```
Replace with:
```python
assert finding.extra["trace"]["overallScore"] > 0
```

And for marker tools:
```python
# Old: assert finding.extra["marker_tools"] == [...]
assert finding.extra["trace"]["signals"]["markers"]["detail"]["tools"] == [...]
```

**Step 4: Run all tests again**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/ -v`
Expected: ALL PASSED

**Step 5: Commit**

```bash
git add agents/ai-detector/sentinel_aidetector/agent.py agents/ai-detector/tests/test_agent.py
git commit -m "feat(ai-detector): integrate TraceBuilder into agent process loop"
```

---

### Task 3: Prisma schema — DecisionTrace model

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add DecisionTrace model**

Add after the `Finding` model (after line 122 in schema.prisma):

```prisma
model DecisionTrace {
  id              String    @id @default(uuid()) @db.Uuid
  findingId       String    @unique @map("finding_id") @db.Uuid
  orgId           String    @map("org_id") @db.Uuid
  scanId          String    @map("scan_id") @db.Uuid

  toolName        String?   @map("tool_name")
  modelVersion    String?   @map("model_version")
  promptHash      String?   @map("prompt_hash")
  promptCategory  String?   @map("prompt_category")

  overallScore    Float     @map("overall_score")
  signals         Json      @map("signals")

  declaredTool    String?   @map("declared_tool")
  declaredModel   String?   @map("declared_model")
  enrichedAt      DateTime? @map("enriched_at")

  createdAt       DateTime  @default(now()) @map("created_at")

  finding         Finding   @relation(fields: [findingId], references: [id])

  @@index([orgId, toolName])
  @@index([scanId])
  @@map("decision_traces")
}
```

**Step 2: Add reverse relation to Finding model**

In the `Finding` model (around line 117, after the `remediationItems` relation), add:

```prisma
  decisionTrace   DecisionTrace?
```

**Step 3: Generate Prisma client**

Run: `cd packages/db && npx prisma generate`
Expected: `Prisma Client generated` message

**Step 4: Create migration**

Run: `cd packages/db && npx prisma migrate dev --name add_decision_trace`
Expected: Migration created successfully

**Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add DecisionTrace model with signal decomposition"
```

---

### Task 4: Pure extraction functions (compliance package)

**Files:**
- Create: `packages/compliance/src/decision-trace/extract.ts`
- Test: `packages/compliance/src/__tests__/decision-trace-extract.test.ts`

**Step 1: Write the failing tests**

Create `packages/compliance/src/__tests__/decision-trace-extract.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractTrace, dominantSignal, type TraceSignals } from "../decision-trace/extract.js";

describe("extractTrace", () => {
  const validRawData = {
    trace: {
      toolName: "copilot",
      promptHash: "abc123",
      promptCategory: "code-completion",
      overallScore: 0.72,
      signals: {
        entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: { tokenEntropy: 3.2 } },
        markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: { tools: ["copilot"], matchCount: 2 } },
        timing: { weight: 0.20, rawValue: 50, probability: 0.7, contribution: 0.14, detail: { linesChanged: 50, isBurst: false, sizeUniformity: 0.3 } },
        uniformity: { weight: 0.20, rawValue: 0.55, probability: 0.55, contribution: 0.11, detail: {} },
      },
    },
  };

  it("extracts a valid trace from rawData", () => {
    const result = extractTrace(validRawData);
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe("copilot");
    expect(result!.promptHash).toBe("abc123");
    expect(result!.promptCategory).toBe("code-completion");
    expect(result!.overallScore).toBe(0.72);
    expect(result!.signals.entropy!.contribution).toBe(0.20);
  });

  it("returns null for null rawData", () => {
    expect(extractTrace(null)).toBeNull();
  });

  it("returns null for rawData without trace key", () => {
    expect(extractTrace({ ai_probability: 0.8 })).toBeNull();
  });

  it("returns null for non-object rawData", () => {
    expect(extractTrace("hello")).toBeNull();
  });

  it("handles missing optional fields with null defaults", () => {
    const minimal = {
      trace: {
        overallScore: 0.5,
        signals: {},
      },
    };
    const result = extractTrace(minimal);
    expect(result).not.toBeNull();
    expect(result!.toolName).toBeNull();
    expect(result!.promptHash).toBeNull();
    expect(result!.promptCategory).toBeNull();
    expect(result!.overallScore).toBe(0.5);
  });

  it("returns null when trace is not an object", () => {
    expect(extractTrace({ trace: "not-an-object" })).toBeNull();
  });
});

describe("dominantSignal", () => {
  it("returns the signal with highest contribution", () => {
    const signals: TraceSignals = {
      entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
      markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    };
    expect(dominantSignal(signals)).toBe("markers");
  });

  it("returns 'unknown' for empty signals", () => {
    expect(dominantSignal({})).toBe("unknown");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/decision-trace-extract.test.ts`
Expected: FAIL with `Cannot find module '../decision-trace/extract.js'`

**Step 3: Write minimal implementation**

Create `packages/compliance/src/decision-trace/extract.ts`:

```typescript
export interface TraceSignalDetail {
  weight: number;
  rawValue: number;
  probability: number;
  contribution: number;
  detail: Record<string, unknown>;
}

export type TraceSignals = Record<string, TraceSignalDetail>;

export interface ExtractedTrace {
  toolName: string | null;
  promptHash: string | null;
  promptCategory: string | null;
  overallScore: number;
  signals: TraceSignals;
}

/**
 * Extract a structured trace from a finding's rawData.
 * Returns null if the finding has no trace data (non-AI findings).
 */
export function extractTrace(rawData: unknown): ExtractedTrace | null {
  if (!rawData || typeof rawData !== "object") return null;
  const data = rawData as Record<string, unknown>;
  if (!data.trace || typeof data.trace !== "object") return null;
  const trace = data.trace as Record<string, unknown>;
  return {
    toolName: (trace.toolName as string) ?? null,
    promptHash: (trace.promptHash as string) ?? null,
    promptCategory: (trace.promptCategory as string) ?? null,
    overallScore: (trace.overallScore as number) ?? 0,
    signals: (trace.signals as TraceSignals) ?? {},
  };
}

/**
 * Compute the dominant signal -- which factor contributed most to the decision.
 */
export function dominantSignal(signals: TraceSignals): string {
  let max = 0;
  let name = "unknown";
  for (const [key, sig] of Object.entries(signals)) {
    if (sig && typeof sig.contribution === "number" && sig.contribution > max) {
      max = sig.contribution;
      name = key;
    }
  }
  return name;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/decision-trace-extract.test.ts`
Expected: 8 PASSED

**Step 5: Commit**

```bash
git add packages/compliance/src/decision-trace/extract.ts packages/compliance/src/__tests__/decision-trace-extract.test.ts
git commit -m "feat(compliance): add pure extraction functions for decision trace"
```

---

### Task 5: DecisionTraceService (compliance package)

**Files:**
- Create: `packages/compliance/src/decision-trace/service.ts`
- Test: `packages/compliance/src/__tests__/decision-trace-service.test.ts`
- Modify: `packages/compliance/src/index.ts` (add exports)

**Step 1: Write the failing tests**

Create `packages/compliance/src/__tests__/decision-trace-service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DecisionTraceService } from "../decision-trace/service.js";

function mockDb() {
  return {
    decisionTrace: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const AI_RAW_DATA = {
  trace: {
    toolName: "copilot",
    promptHash: null,
    promptCategory: "code-completion",
    overallScore: 0.72,
    signals: {
      entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
      markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    },
  },
};

describe("DecisionTraceService", () => {
  let db: ReturnType<typeof mockDb>;
  let service: DecisionTraceService;

  beforeEach(() => {
    db = mockDb();
    service = new DecisionTraceService(db);
  });

  it("creates a trace from AI finding rawData", async () => {
    await service.createFromFinding("f1", "org1", "s1", AI_RAW_DATA);
    expect(db.decisionTrace.create).toHaveBeenCalledOnce();
    const call = db.decisionTrace.create.mock.calls[0][0];
    expect(call.data.findingId).toBe("f1");
    expect(call.data.toolName).toBe("copilot");
    expect(call.data.overallScore).toBe(0.72);
  });

  it("skips creation for non-AI findings (no trace key)", async () => {
    await service.createFromFinding("f2", "org1", "s1", { some: "data" });
    expect(db.decisionTrace.create).not.toHaveBeenCalled();
  });

  it("enriches trace with declared metadata", async () => {
    await service.enrichWithDeclared("f1", "cursor", "claude-sonnet-4-20250514");
    expect(db.decisionTrace.update).toHaveBeenCalledOnce();
    const call = db.decisionTrace.update.mock.calls[0][0];
    expect(call.where.findingId).toBe("f1");
    expect(call.data.declaredTool).toBe("cursor");
    expect(call.data.declaredModel).toBe("claude-sonnet-4-20250514");
    expect(call.data.enrichedAt).toBeInstanceOf(Date);
  });

  it("getByFindingId delegates to findUnique", async () => {
    await service.getByFindingId("f1");
    expect(db.decisionTrace.findUnique).toHaveBeenCalledWith({ where: { findingId: "f1" } });
  });

  it("getByScanId delegates to findMany ordered by createdAt", async () => {
    await service.getByScanId("s1");
    expect(db.decisionTrace.findMany).toHaveBeenCalledWith({
      where: { scanId: "s1" },
      orderBy: { createdAt: "asc" },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/compliance && npx vitest run src/__tests__/decision-trace-service.test.ts`
Expected: FAIL with `Cannot find module '../decision-trace/service.js'`

**Step 3: Write minimal implementation**

Create `packages/compliance/src/decision-trace/service.ts`:

```typescript
import { extractTrace, type ExtractedTrace, type TraceSignals } from "./extract.js";

export class DecisionTraceService {
  constructor(private db: any) {}

  async createFromFinding(
    findingId: string,
    orgId: string,
    scanId: string,
    rawData: unknown,
  ): Promise<void> {
    const trace = extractTrace(rawData);
    if (!trace) return;

    await this.db.decisionTrace.create({
      data: {
        findingId,
        orgId,
        scanId,
        toolName: trace.toolName,
        promptHash: trace.promptHash,
        promptCategory: trace.promptCategory,
        overallScore: trace.overallScore,
        signals: trace.signals,
      },
    });
  }

  async enrichWithDeclared(
    findingId: string,
    declaredTool: string,
    declaredModel: string,
  ): Promise<void> {
    await this.db.decisionTrace.update({
      where: { findingId },
      data: {
        declaredTool,
        declaredModel,
        modelVersion: declaredModel,
        enrichedAt: new Date(),
      },
    });
  }

  async getByFindingId(findingId: string) {
    return this.db.decisionTrace.findUnique({ where: { findingId } });
  }

  async getByScanId(scanId: string) {
    return this.db.decisionTrace.findMany({
      where: { scanId },
      orderBy: { createdAt: "asc" },
    });
  }
}
```

**Step 4: Add barrel exports to `packages/compliance/src/index.ts`**

Add at the end of the file:

```typescript
// Decision Trace
export { extractTrace, dominantSignal, type TraceSignalDetail, type TraceSignals, type ExtractedTrace } from "./decision-trace/extract.js";
export { DecisionTraceService } from "./decision-trace/service.js";
```

**Step 5: Run test to verify it passes**

Run: `cd packages/compliance && npx vitest run src/__tests__/decision-trace-service.test.ts`
Expected: 5 PASSED

**Step 6: Commit**

```bash
git add packages/compliance/src/decision-trace/service.ts packages/compliance/src/index.ts packages/compliance/src/__tests__/decision-trace-service.test.ts
git commit -m "feat(compliance): add DecisionTraceService with create, enrich, query"
```

---

### Task 6: API endpoints for decision traces

**Files:**
- Create: `apps/api/src/routes/decision-traces.ts`
- Modify: `apps/api/src/server.ts` (register routes)

**Step 1: Create route builder**

Create `apps/api/src/routes/decision-traces.ts`:

```typescript
import { DecisionTraceService } from "@sentinel/compliance";

interface DecisionTraceRouteDeps {
  db: any;
}

export function buildDecisionTraceRoutes(deps: DecisionTraceRouteDeps) {
  const service = new DecisionTraceService(deps.db);

  return {
    getByFinding: (findingId: string) => service.getByFindingId(findingId),
    getByScan: (scanId: string) => service.getByScanId(scanId),
  };
}
```

**Step 2: Register endpoints in server.ts**

In `apps/api/src/server.ts`:

1. Add import near line 28 (after `buildRiskTrendRoutes`):
   ```typescript
   import { buildDecisionTraceRoutes } from "./routes/decision-traces.js";
   ```

2. After the `riskTrendRoutes` instantiation (search for `buildRiskTrendRoutes({ db })`), add:
   ```typescript
   const decisionTraceRoutes = buildDecisionTraceRoutes({ db });
   ```

3. Before the `// --- Graceful shutdown ---` comment, add:
   ```typescript
   // ── Decision Traces ────────────────────────────────────────
   app.get("/v1/findings/:id/trace", { preHandler: authHook }, async (request) => {
     const orgId = (request as any).orgId ?? "default";
     const { id } = request.params as { id: string };
     return withTenant(db, orgId, () => decisionTraceRoutes.getByFinding(id));
   });

   app.get("/v1/scans/:id/traces", { preHandler: authHook }, async (request) => {
     const orgId = (request as any).orgId ?? "default";
     const { id } = request.params as { id: string };
     return withTenant(db, orgId, () => decisionTraceRoutes.getByScan(id));
   });
   ```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/routes/decision-traces.ts apps/api/src/server.ts
git commit -m "feat(api): add GET /v1/findings/:id/trace and GET /v1/scans/:id/traces"
```

---

### Task 7: Dashboard types, API client, and trace card component

**Files:**
- Modify: `apps/dashboard/lib/types.ts:293` (add types at end)
- Modify: `apps/dashboard/lib/api.ts` (add `getDecisionTrace` function)
- Create: `apps/dashboard/components/signal-bar.tsx`
- Create: `apps/dashboard/components/decision-trace-card.tsx`
- Modify: `apps/dashboard/app/(dashboard)/findings/[id]/page.tsx` (add trace section)

**Step 1: Add dashboard types**

At the end of `apps/dashboard/lib/types.ts`, add:

```typescript
// Decision Trace
export interface DecisionTraceSignal {
  weight: number;
  rawValue: number;
  probability: number;
  contribution: number;
  detail: Record<string, unknown>;
}

export interface DecisionTrace {
  id: string;
  findingId: string;
  toolName: string | null;
  modelVersion: string | null;
  promptHash: string | null;
  promptCategory: string | null;
  overallScore: number;
  signals: Record<string, DecisionTraceSignal>;
  declaredTool: string | null;
  declaredModel: string | null;
  enrichedAt: string | null;
}
```

**Step 2: Add API client function**

At the end of `apps/dashboard/lib/api.ts` (before any mock data sections), add:

```typescript
// ── Decision Trace ────────────────────────────────────────────────────
export async function getDecisionTrace(findingId: string): Promise<DecisionTrace | null> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    return apiGet<DecisionTrace>(`/v1/findings/${findingId}/trace`, {}, headers);
  }, null);
}
```

Also add the `DecisionTrace` import to the top of `api.ts`:

```typescript
import type {
  // ... existing imports ...
  DecisionTrace,
} from "./types";
```

**Step 3: Also add `agentName` to the Finding type and getFindingById mapper**

In `apps/dashboard/lib/types.ts`, add `agentName: string;` to the `Finding` interface (after `createdAt`):

```typescript
export interface Finding {
  // ... existing fields ...
  createdAt: string;
  agentName: string;
}
```

In `apps/dashboard/lib/api.ts`, in the `getFindingById` function (around line 216-232), add to the return object:

```typescript
      agentName: f.agentName ?? f.agent_name ?? "",
```

And in the `getFindings` function mapper, add the same field.

**Step 4: Create signal-bar component**

Create `apps/dashboard/components/signal-bar.tsx`:

```tsx
interface SignalBarProps {
  name: string;
  weight: number;
  probability: number;
  contribution: number;
  overallScore: number;
}

function barColor(contribution: number): string {
  if (contribution > 0.2) return "bg-status-error";
  if (contribution > 0.1) return "bg-status-warn";
  return "bg-text-tertiary";
}

export function SignalBar({
  name,
  weight,
  probability,
  contribution,
  overallScore,
}: SignalBarProps) {
  const pct = overallScore > 0 ? (contribution / overallScore) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-right text-[11px] font-medium text-text-secondary">
        {name}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-surface-3">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barColor(contribution)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="w-40 text-[10px] tabular-nums text-text-tertiary">
        {(weight * 100).toFixed(0)}% &times; {probability.toFixed(2)} = {(contribution * 100).toFixed(0)}%
      </span>
    </div>
  );
}
```

**Step 5: Create decision-trace-card component**

Create `apps/dashboard/components/decision-trace-card.tsx`:

```tsx
import { getDecisionTrace } from "@/lib/api";
import { SignalBar } from "@/components/signal-bar";

interface DecisionTraceCardProps {
  findingId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function DecisionTraceCard({ findingId }: DecisionTraceCardProps) {
  const trace = await getDecisionTrace(findingId);
  if (!trace) return null;

  const signalEntries = Object.entries(trace.signals)
    .sort(([, a], [, b]) => b.contribution - a.contribution);

  return (
    <section
      aria-label="AI Decision Trace"
      className="animate-fade-up"
      style={{ animationDelay: "0.08s" }}
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        AI Decision Trace
      </h2>
      <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-5">
        {/* Metadata row */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Tool
            </p>
            <p className="mt-1 text-[12px] text-text-secondary">
              {trace.toolName ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Model
            </p>
            <p className="mt-1 text-[12px] text-text-secondary">
              {trace.modelVersion ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Category
            </p>
            <p className="mt-1 text-[12px] capitalize text-text-secondary">
              {trace.promptCategory?.replace(/-/g, " ") ?? "\u2014"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Overall Score
            </p>
            <p className="mt-1 text-[12px] font-bold text-text-primary">
              {(trace.overallScore * 100).toFixed(0)}%
            </p>
          </div>
        </div>

        {/* Signal bars */}
        {signalEntries.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Signal Contributions
            </p>
            <div className="space-y-2">
              {signalEntries.map(([name, sig]) => (
                <SignalBar
                  key={name}
                  name={name}
                  weight={sig.weight}
                  probability={sig.probability}
                  contribution={sig.contribution}
                  overallScore={trace.overallScore}
                />
              ))}
            </div>
          </div>
        )}

        {/* Enrichment */}
        {trace.declaredTool && (
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              Pre-declared Metadata
            </p>
            <div className="flex flex-wrap gap-4 text-[12px] text-text-secondary">
              <span>
                Declared tool: <strong>{trace.declaredTool}</strong>
              </span>
              {trace.declaredModel && (
                <span>
                  Declared model: <strong>{trace.declaredModel}</strong>
                </span>
              )}
              {trace.enrichedAt && (
                <span className="text-text-tertiary">
                  Enriched {formatDate(trace.enrichedAt)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
```

**Step 6: Add trace card to finding detail page**

In `apps/dashboard/app/(dashboard)/findings/[id]/page.tsx`:

1. Add import after existing imports (around line 5):
   ```typescript
   import { DecisionTraceCard } from "@/components/decision-trace-card";
   ```

2. After the "Details" metadata section (the `</section>` closing tag around line 128) and before the "Affected Code" section (around line 131), add:

   ```tsx
         {/* AI Decision Trace (only for ai-detector findings) */}
         {finding.agentName === "ai-detector" && (
           <DecisionTraceCard findingId={finding.id} />
         )}
   ```

**Step 7: Verify TypeScript compiles**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: No errors (the existing webpack/node:crypto issue may appear for full build but tsc --noEmit should pass)

**Step 8: Commit**

```bash
git add apps/dashboard/lib/types.ts apps/dashboard/lib/api.ts apps/dashboard/components/signal-bar.tsx apps/dashboard/components/decision-trace-card.tsx "apps/dashboard/app/(dashboard)/findings/[id]/page.tsx"
git commit -m "feat(dashboard): add decision trace card to finding detail page"
```

---

### Task 8: Dashboard component tests

**Files:**
- Create: `apps/dashboard/__tests__/signal-bar.test.tsx`
- Create: `apps/dashboard/__tests__/decision-trace-card.test.tsx`

**Step 1: Write signal-bar tests**

Create `apps/dashboard/__tests__/signal-bar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SignalBar } from "../components/signal-bar";

describe("SignalBar", () => {
  it("renders signal name and formula", () => {
    const { container } = render(
      <SignalBar
        name="markers"
        weight={0.35}
        probability={0.8}
        contribution={0.28}
        overallScore={0.72}
      />,
    );
    expect(screen.getByText("markers")).toBeDefined();
    expect(container.textContent).toContain("35%");
    expect(container.textContent).toContain("0.80");
    expect(container.textContent).toContain("28%");
  });

  it("uses error color for high contribution", () => {
    const { container } = render(
      <SignalBar
        name="markers"
        weight={0.35}
        probability={0.8}
        contribution={0.28}
        overallScore={0.72}
      />,
    );
    const bar = container.querySelector("[class*='bg-status-error']");
    expect(bar).not.toBeNull();
  });

  it("uses tertiary color for low contribution", () => {
    const { container } = render(
      <SignalBar
        name="uniformity"
        weight={0.2}
        probability={0.3}
        contribution={0.06}
        overallScore={0.72}
      />,
    );
    const bar = container.querySelector("[class*='bg-text-tertiary']");
    expect(bar).not.toBeNull();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/signal-bar.test.tsx`
Expected: 3 PASSED

**Step 3: Write decision-trace-card tests**

Create `apps/dashboard/__tests__/decision-trace-card.test.tsx`:

Note: `DecisionTraceCard` is an async server component. Testing it requires calling it as a function and awaiting the result. Use the pattern from existing dashboard tests.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the API module
vi.mock("../lib/api", () => ({
  getDecisionTrace: vi.fn(),
}));

import { getDecisionTrace } from "../lib/api";
import { DecisionTraceCard } from "../components/decision-trace-card";

const mockTrace = {
  id: "t1",
  findingId: "f1",
  toolName: "copilot",
  modelVersion: null,
  promptHash: null,
  promptCategory: "code-completion",
  overallScore: 0.72,
  signals: {
    markers: { weight: 0.35, rawValue: 2, probability: 0.8, contribution: 0.28, detail: {} },
    entropy: { weight: 0.25, rawValue: 3.5, probability: 0.8, contribution: 0.20, detail: {} },
  },
  declaredTool: null,
  declaredModel: null,
  enrichedAt: null,
};

describe("DecisionTraceCard", () => {
  it("renders trace card with signal bars", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(mockTrace);
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    expect(screen.getByText("AI Decision Trace")).toBeDefined();
    expect(screen.getByText("copilot")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
    expect(screen.getByText("markers")).toBeDefined();
    expect(screen.getByText("entropy")).toBeDefined();
  });

  it("returns null when no trace exists", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(null);
    const jsx = await DecisionTraceCard({ findingId: "f2" });
    expect(jsx).toBeNull();
  });

  it("shows dash for null fields", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue(mockTrace);
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    // modelVersion is null, should show em-dash
    const cells = container.querySelectorAll("p");
    const modelCell = Array.from(cells).find((p) => p.textContent === "\u2014");
    expect(modelCell).toBeDefined();
  });

  it("shows enrichment section when declared tool exists", async () => {
    vi.mocked(getDecisionTrace).mockResolvedValue({
      ...mockTrace,
      declaredTool: "cursor",
      declaredModel: "claude-sonnet-4-20250514",
      enrichedAt: "2026-03-14T14:30:00Z",
    });
    const jsx = await DecisionTraceCard({ findingId: "f1" });
    const { container } = render(jsx!);
    expect(container.textContent).toContain("cursor");
    expect(container.textContent).toContain("claude-sonnet-4-20250514");
    expect(container.textContent).toContain("Enriched");
  });
});
```

**Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run __tests__/decision-trace-card.test.tsx __tests__/signal-bar.test.tsx`
Expected: 7 PASSED

**Step 5: Commit**

```bash
git add apps/dashboard/__tests__/signal-bar.test.tsx apps/dashboard/__tests__/decision-trace-card.test.tsx
git commit -m "test(dashboard): add decision trace card and signal bar component tests"
```

---

### Task 9: Cross-language schema compatibility test

**Files:**
- Create: `agents/ai-detector/tests/test_trace_schema_compat.py`

**Step 1: Write the schema compatibility test**

Create `agents/ai-detector/tests/test_trace_schema_compat.py`:

```python
"""Cross-language schema compatibility test.

Validates that Python TraceBuilder output matches the TypeScript
TraceSignals interface field names (camelCase convention).
"""

import json
from sentinel_aidetector.trace import SignalDetail, TraceBuilder


# These are the exact keys expected by the TypeScript TraceSignals interface
EXPECTED_SIGNAL_KEYS = {"weight", "rawValue", "probability", "contribution", "detail"}
EXPECTED_TRACE_KEYS = {"toolName", "promptHash", "promptCategory", "overallScore", "signals"}


def test_trace_output_matches_typescript_shape():
    """TraceBuilder output must have exact keys expected by TS interface."""
    tb = TraceBuilder(
        tool_name="copilot",
        prompt_hash="abc123",
        prompt_category="code-completion",
        entropy=SignalDetail(
            weight=0.25, raw_value=3.5, probability=0.8, contribution=0.20,
            detail={"tokenEntropy": 3.2, "structureEntropy": 4.0, "namingEntropy": 3.3},
        ),
        uniformity=SignalDetail(weight=0.20, raw_value=0.6, probability=0.6, contribution=0.12),
        markers=SignalDetail(
            weight=0.35, raw_value=2.0, probability=0.8, contribution=0.28,
            detail={"tools": ["copilot"], "matchCount": 2},
        ),
        timing=SignalDetail(
            weight=0.20, raw_value=50.0, probability=0.5, contribution=0.10,
            detail={"linesChanged": 50, "isBurst": False, "sizeUniformity": 0.3},
        ),
    )
    extra = tb.to_extra()
    trace = extra["trace"]

    # Validate top-level trace keys
    assert set(trace.keys()) == EXPECTED_TRACE_KEYS

    # Validate each signal has the correct keys
    for signal_name, signal_data in trace["signals"].items():
        assert set(signal_data.keys()) == EXPECTED_SIGNAL_KEYS, (
            f"Signal '{signal_name}' has keys {set(signal_data.keys())}, "
            f"expected {EXPECTED_SIGNAL_KEYS}"
        )


def test_trace_output_is_json_serializable():
    """TraceBuilder output must serialize to valid JSON (no Python-only types)."""
    tb = TraceBuilder(
        tool_name="chatgpt",
        markers=SignalDetail(
            weight=0.35, raw_value=1.0, probability=0.4, contribution=0.14,
            detail={"tools": ["chatgpt"], "matchCount": 1},
        ),
        timing=SignalDetail(
            weight=0.20, raw_value=100.0, probability=0.7, contribution=0.14,
            detail={"linesChanged": 100, "isBurst": True, "sizeUniformity": 0.8},
        ),
    )
    extra = tb.to_extra()
    # Must not raise
    json_str = json.dumps(extra)
    # Must round-trip cleanly
    parsed = json.loads(json_str)
    assert parsed["trace"]["toolName"] == "chatgpt"
    assert parsed["trace"]["signals"]["timing"]["detail"]["isBurst"] is True
```

**Step 2: Run test to verify it passes**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/test_trace_schema_compat.py -v`
Expected: 2 PASSED

**Step 3: Commit**

```bash
git add agents/ai-detector/tests/test_trace_schema_compat.py
git commit -m "test(ai-detector): add cross-language schema compatibility test"
```

---

### Task 10: Run all tests and verify

**Step 1: Run compliance package tests**

Run: `cd packages/compliance && npx vitest run`
Expected: All tests pass including new decision-trace-extract and decision-trace-service tests

**Step 2: Run AI detector agent tests**

Run: `cd agents/ai-detector && .venv/bin/pytest tests/ -v`
Expected: All tests pass including new trace, schema compat, and updated agent tests

**Step 3: Run dashboard tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: All tests pass including new signal-bar and decision-trace-card tests

**Step 4: Run API TypeScript check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address test failures from decision trace integration"
```

Only commit if fixups were needed. If all tests passed on first run, skip this step.
