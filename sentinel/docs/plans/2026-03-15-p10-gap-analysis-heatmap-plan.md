# P10: Gap Analysis Heatmap — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a compliance gap analysis page at `/compliance/gap-analysis` with an interactive SVG heatmap showing control-level scores across frameworks.

**Architecture:** Server component fetches compliance scores (mock data for now, API when available), passes to client heatmap grid. Custom SVG for heatmap, Recharts for trend sparklines only. All new code in `apps/dashboard/components/compliance/` and `apps/dashboard/app/(dashboard)/compliance/`.

**Tech Stack:** Next.js 15 Server Components, React 19, Custom SVG, Recharts ^2.15, Tailwind CSS 4, Vitest

---

### Task 1: Add Compliance Types

**Files:**
- Modify: `apps/dashboard/lib/types.ts`

**Step 1: Add compliance types to the bottom of types.ts**

```typescript
// ── Compliance ────────────────────────────────────────────────────────

export type ComplianceVerdict =
  | "compliant"
  | "partially_compliant"
  | "needs_remediation"
  | "non_compliant";

export interface ControlScore {
  controlCode: string;
  controlName: string;
  score: number; // 0.0–1.0
  passing: number;
  failing: number;
  total: number;
}

export interface FrameworkScore {
  frameworkSlug: string;
  frameworkName: string;
  score: number; // 0.0–1.0
  verdict: ComplianceVerdict;
  controlScores: ControlScore[];
}

export interface ComplianceTrendPoint {
  date: string; // ISO 8601
  score: number; // 0.0–1.0
}
```

**Step 2: Verify types compile**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to compliance types

**Step 3: Commit**

```bash
git add apps/dashboard/lib/types.ts
git commit -m "feat(dashboard): add compliance types for gap analysis heatmap"
```

---

### Task 2: Add Compliance Mock Data

**Files:**
- Modify: `apps/dashboard/lib/mock-data.ts`

**Step 1: Add mock compliance data to the bottom of mock-data.ts**

```typescript
import type { FrameworkScore, ComplianceTrendPoint } from "./types";

// ── Compliance Scores ────────────────────────────────────────────────

export const MOCK_FRAMEWORK_SCORES: FrameworkScore[] = [
  {
    frameworkSlug: "soc2",
    frameworkName: "SOC 2 Type II",
    score: 0.82,
    verdict: "partially_compliant",
    controlScores: [
      { controlCode: "CC1.1", controlName: "COSO Principle 1", score: 0.95, passing: 19, failing: 1, total: 20 },
      { controlCode: "CC1.2", controlName: "COSO Principle 2", score: 0.88, passing: 15, failing: 2, total: 17 },
      { controlCode: "CC2.1", controlName: "Information & Communication", score: 0.72, passing: 8, failing: 3, total: 11 },
      { controlCode: "CC3.1", controlName: "Risk Assessment", score: 0.65, passing: 6, failing: 3, total: 9 },
      { controlCode: "CC4.1", controlName: "Monitoring Activities", score: 0.90, passing: 18, failing: 2, total: 20 },
      { controlCode: "CC5.1", controlName: "Control Activities", score: 0.78, passing: 14, failing: 4, total: 18 },
      { controlCode: "CC6.1", controlName: "Logical Access Controls", score: 0.72, passing: 18, failing: 7, total: 25 },
      { controlCode: "CC6.2", controlName: "Physical Access Controls", score: 0.85, passing: 11, failing: 2, total: 13 },
      { controlCode: "CC6.3", controlName: "System Operations", score: 0.55, passing: 5, failing: 4, total: 9 },
      { controlCode: "CC7.1", controlName: "Change Management", score: 0.92, passing: 22, failing: 2, total: 24 },
      { controlCode: "CC7.2", controlName: "System Monitoring", score: 0.68, passing: 7, failing: 3, total: 10 },
      { controlCode: "CC8.1", controlName: "Risk Mitigation", score: 0.97, passing: 30, failing: 1, total: 31 },
    ],
  },
  {
    frameworkSlug: "iso27001",
    frameworkName: "ISO 27001:2022",
    score: 0.76,
    verdict: "needs_remediation",
    controlScores: [
      { controlCode: "A.5", controlName: "Information Security Policies", score: 0.90, passing: 9, failing: 1, total: 10 },
      { controlCode: "A.6", controlName: "Organization of InfoSec", score: 0.80, passing: 12, failing: 3, total: 15 },
      { controlCode: "A.7", controlName: "Human Resource Security", score: 0.50, passing: 3, failing: 3, total: 6 },
      { controlCode: "A.8", controlName: "Asset Management", score: 0.72, passing: 8, failing: 3, total: 11 },
      { controlCode: "A.9", controlName: "Access Control", score: 0.65, passing: 6, failing: 3, total: 9 },
      { controlCode: "A.10", controlName: "Cryptography", score: 0.95, passing: 19, failing: 1, total: 20 },
      { controlCode: "A.11", controlName: "Physical Security", score: 0.40, passing: 2, failing: 3, total: 5 },
      { controlCode: "A.12", controlName: "Operations Security", score: 0.82, passing: 14, failing: 3, total: 17 },
      { controlCode: "A.13", controlName: "Communications Security", score: 0.88, passing: 7, failing: 1, total: 8 },
      { controlCode: "A.14", controlName: "System Acquisition", score: 0.70, passing: 7, failing: 3, total: 10 },
    ],
  },
  {
    frameworkSlug: "slsa",
    frameworkName: "SLSA v1.0",
    score: 0.91,
    verdict: "compliant",
    controlScores: [
      { controlCode: "SL1", controlName: "Source - Version Controlled", score: 1.0, passing: 12, failing: 0, total: 12 },
      { controlCode: "SL2", controlName: "Build - Scripted Build", score: 0.95, passing: 19, failing: 1, total: 20 },
      { controlCode: "SL3", controlName: "Build - Build Service", score: 0.88, passing: 7, failing: 1, total: 8 },
      { controlCode: "SL4", controlName: "Build - Provenance", score: 0.80, passing: 4, failing: 1, total: 5 },
      { controlCode: "SL5", controlName: "Dependencies - Tracked", score: 0.92, passing: 11, failing: 1, total: 12 },
      { controlCode: "SL6", controlName: "Dependencies - Scanned", score: 0.85, passing: 17, failing: 3, total: 20 },
      { controlCode: "SL7", controlName: "Dependencies - Pinned", score: 1.0, passing: 8, failing: 0, total: 8 },
      { controlCode: "SL8", controlName: "Artifacts - Signed", score: 0.90, passing: 9, failing: 1, total: 10 },
    ],
  },
  {
    frameworkSlug: "gdpr",
    frameworkName: "GDPR",
    score: 0.58,
    verdict: "non_compliant",
    controlScores: [
      { controlCode: "Art.5", controlName: "Principles", score: 0.70, passing: 7, failing: 3, total: 10 },
      { controlCode: "Art.6", controlName: "Lawfulness of Processing", score: 0.60, passing: 3, failing: 2, total: 5 },
      { controlCode: "Art.25", controlName: "Data Protection by Design", score: 0.45, passing: 4, failing: 5, total: 9 },
      { controlCode: "Art.30", controlName: "Records of Processing", score: 0.55, passing: 5, failing: 4, total: 9 },
      { controlCode: "Art.32", controlName: "Security of Processing", score: 0.72, passing: 8, failing: 3, total: 11 },
      { controlCode: "Art.33", controlName: "Breach Notification", score: 0.30, passing: 1, failing: 2, total: 3 },
      { controlCode: "Art.35", controlName: "Data Protection Impact", score: 0.50, passing: 2, failing: 2, total: 4 },
      { controlCode: "Art.37", controlName: "Data Protection Officer", score: 0.80, passing: 4, failing: 1, total: 5 },
    ],
  },
];

export const MOCK_COMPLIANCE_TRENDS: Record<string, ComplianceTrendPoint[]> = {
  soc2: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
    score: 0.75 + Math.sin(i / 5) * 0.05 + i * 0.002,
  })),
  iso27001: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
    score: 0.70 + Math.sin(i / 4) * 0.04 + i * 0.002,
  })),
  slsa: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
    score: 0.85 + Math.sin(i / 6) * 0.03 + i * 0.002,
  })),
  gdpr: Array.from({ length: 30 }, (_, i) => ({
    date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split("T")[0],
    score: 0.50 + Math.sin(i / 3) * 0.06 + i * 0.003,
  })),
};
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/lib/mock-data.ts
git commit -m "feat(dashboard): add compliance mock data for gap analysis heatmap"
```

---

### Task 3: Add Compliance API Functions

**Files:**
- Modify: `apps/dashboard/lib/api.ts`

**Step 1: Add compliance API functions to the bottom of api.ts**

Add the import for the new types at the top import block:
```typescript
import type {
  // ... existing imports ...
  FrameworkScore,
  ComplianceTrendPoint,
} from "./types";
```

Add the mock imports:
```typescript
import {
  // ... existing imports ...
  MOCK_FRAMEWORK_SCORES,
  MOCK_COMPLIANCE_TRENDS,
} from "./mock-data";
```

Add the API functions:
```typescript
// ── Compliance ────────────────────────────────────────────────────────

export async function getComplianceScores(): Promise<FrameworkScore[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ frameworks: any[] }>("/v1/compliance/scores", undefined, headers);
    return (data.frameworks ?? []).map((fw: any) => ({
      frameworkSlug: fw.frameworkSlug,
      frameworkName: fw.frameworkName ?? fw.frameworkSlug,
      score: fw.score,
      verdict: fw.verdict,
      controlScores: (fw.controlScores ?? []).map((cs: any) => ({
        controlCode: cs.controlCode,
        controlName: cs.controlName ?? cs.controlCode,
        score: cs.score,
        passing: cs.passing,
        failing: cs.failing,
        total: cs.total,
      })),
    }));
  }, MOCK_FRAMEWORK_SCORES);
}

export async function getComplianceTrends(
  frameworkSlug: string,
): Promise<ComplianceTrendPoint[]> {
  return tryApi(async (headers) => {
    const { apiGet } = await import("./api-client");
    const data = await apiGet<{ trends: any[] }>(
      `/v1/compliance/trends/${frameworkSlug}`,
      undefined,
      headers,
    );
    return (data.trends ?? []).map((t: any) => ({
      date: t.date,
      score: t.score,
    }));
  }, MOCK_COMPLIANCE_TRENDS[frameworkSlug] ?? []);
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/lib/api.ts
git commit -m "feat(dashboard): add compliance API functions with mock fallback"
```

---

### Task 4: Add Compliance Nav Item & Route Permission

**Files:**
- Modify: `apps/dashboard/lib/rbac.ts`

**Step 1: Add compliance route permission and nav item**

Add to `ROUTE_PERMISSIONS` array (before the `/` catch-all entry):
```typescript
{ path: "/compliance", roles: ["admin", "manager", "dev", "viewer"] },
```

Add to `NAV_ITEMS` array at index 4 (between Certificates and Policies — under "Compliance" section):
```typescript
{ label: "Gap Analysis", href: "/compliance/gap-analysis", icon: "grid" },
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/lib/rbac.ts
git commit -m "feat(dashboard): add compliance gap analysis nav item and route permission"
```

---

### Task 5: Add IconGrid to Icons

**Files:**
- Modify: `apps/dashboard/components/icons.tsx`

**Step 1: Add grid icon at the bottom of icons.tsx**

```typescript
export function IconGrid(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
```

**Step 2: Register "grid" in the nav-item icon map**

Read `apps/dashboard/components/nav-item.tsx` and add the `grid` icon entry to the icon map.

**Step 3: Commit**

```bash
git add apps/dashboard/components/icons.tsx apps/dashboard/components/nav-item.tsx
git commit -m "feat(dashboard): add grid icon for compliance nav"
```

---

### Task 6: Install Recharts Dependency

**Files:**
- Modify: `apps/dashboard/package.json`

**Step 1: Install recharts**

Run: `cd apps/dashboard && pnpm add recharts@^2.15`

**Step 2: Verify installation**

Run: `cd apps/dashboard && node -e "require('recharts')" && echo "OK"`
Expected: "OK"

**Step 3: Commit**

```bash
git add apps/dashboard/package.json ../../pnpm-lock.yaml
git commit -m "deps(dashboard): add recharts ^2.15 for compliance trend sparklines"
```

---

### Task 7: Create Compliance Shared Types

**Files:**
- Create: `apps/dashboard/components/compliance/types.ts`

**Step 1: Create the shared types file**

```typescript
import type { ControlScore, FrameworkScore, ComplianceVerdict } from "@/lib/types";

export type { ControlScore, FrameworkScore, ComplianceVerdict };

/** Color scale for heatmap cells */
export type HeatmapColor = "green" | "amber" | "orange" | "red" | "gray";

export interface SelectedCell {
  frameworkSlug: string;
  frameworkName: string;
  controlCode: string;
  controlName: string;
  score: number;
  passing: number;
  failing: number;
  total: number;
}

export function scoreToColor(score: number): HeatmapColor {
  if (score >= 0.95) return "green";
  if (score >= 0.80) return "amber";
  if (score >= 0.60) return "orange";
  return "red";
}

export function scoreToVerdict(score: number): string {
  if (score >= 0.95) return "Compliant";
  if (score >= 0.80) return "Partially compliant";
  if (score >= 0.60) return "Needs remediation";
  return "Non-compliant";
}

export function confidenceIndicator(total: number): number {
  return 1 - 1 / Math.sqrt(total + 1);
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/types.ts
git commit -m "feat(compliance): add shared types and scoring helpers"
```

---

### Task 8: Write Tests for Scoring Helpers

**Files:**
- Create: `apps/dashboard/components/compliance/__tests__/types.test.ts`

**Step 1: Write the tests**

```typescript
import { describe, it, expect } from "vitest";
import { scoreToColor, scoreToVerdict, confidenceIndicator } from "../types";

describe("scoreToColor", () => {
  it("returns green for >= 0.95", () => {
    expect(scoreToColor(0.95)).toBe("green");
    expect(scoreToColor(1.0)).toBe("green");
  });

  it("returns amber for 0.80–0.94", () => {
    expect(scoreToColor(0.80)).toBe("amber");
    expect(scoreToColor(0.94)).toBe("amber");
  });

  it("returns orange for 0.60–0.79", () => {
    expect(scoreToColor(0.60)).toBe("orange");
    expect(scoreToColor(0.79)).toBe("orange");
  });

  it("returns red for < 0.60", () => {
    expect(scoreToColor(0.59)).toBe("red");
    expect(scoreToColor(0.0)).toBe("red");
  });
});

describe("scoreToVerdict", () => {
  it("maps scores to verdict strings", () => {
    expect(scoreToVerdict(0.95)).toBe("Compliant");
    expect(scoreToVerdict(0.85)).toBe("Partially compliant");
    expect(scoreToVerdict(0.70)).toBe("Needs remediation");
    expect(scoreToVerdict(0.40)).toBe("Non-compliant");
  });
});

describe("confidenceIndicator", () => {
  it("returns 0 for total=0", () => {
    expect(confidenceIndicator(0)).toBe(0);
  });

  it("returns low confidence for sparse data", () => {
    const conf = confidenceIndicator(3);
    expect(conf).toBeLessThan(0.6);
    expect(conf).toBeGreaterThan(0);
  });

  it("returns high confidence for abundant data", () => {
    const conf = confidenceIndicator(100);
    expect(conf).toBeGreaterThan(0.9);
  });

  it("increases monotonically", () => {
    const c1 = confidenceIndicator(1);
    const c5 = confidenceIndicator(5);
    const c20 = confidenceIndicator(20);
    expect(c5).toBeGreaterThan(c1);
    expect(c20).toBeGreaterThan(c5);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run components/compliance/__tests__/types.test.ts`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/__tests__/types.test.ts
git commit -m "test(compliance): add unit tests for scoring helpers"
```

---

### Task 9: Create SummaryCards Component

**Files:**
- Create: `apps/dashboard/components/compliance/SummaryCards.tsx`

**Step 1: Write the component**

```typescript
import type { FrameworkScore } from "./types";

interface SummaryCardsProps {
  frameworks: FrameworkScore[];
}

export function SummaryCards({ frameworks }: SummaryCardsProps) {
  const avgScore = frameworks.length > 0
    ? frameworks.reduce((sum, fw) => sum + fw.score, 0) / frameworks.length
    : 0;

  const totalControls = frameworks.reduce(
    (sum, fw) => sum + fw.controlScores.length,
    0,
  );

  const metControls = frameworks.reduce(
    (sum, fw) =>
      sum + fw.controlScores.filter((c) => c.score >= 0.80).length,
    0,
  );

  const unmetControls = totalControls - metControls;

  const cards = [
    { label: "Score", value: `${Math.round(avgScore * 100)}%` },
    { label: "Met", value: String(metControls) },
    { label: "Unmet", value: String(unmetControls) },
    { label: "Frameworks", value: `${frameworks.length} active` },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-surface-1 px-4 py-3"
        >
          <p className="text-[11px] font-medium text-text-tertiary">
            {card.label}
          </p>
          <p className="mt-1 text-lg font-bold text-text-primary">
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/SummaryCards.tsx
git commit -m "feat(compliance): add SummaryCards component"
```

---

### Task 10: Create FrameworkFilterBar Component

**Files:**
- Create: `apps/dashboard/components/compliance/FrameworkFilterBar.tsx`

**Step 1: Write the component**

```typescript
"use client";

interface FrameworkFilterBarProps {
  frameworks: { slug: string; name: string }[];
  selected: string[];
  onToggle: (slug: string) => void;
}

export function FrameworkFilterBar({
  frameworks,
  selected,
  onToggle,
}: FrameworkFilterBarProps) {
  const allSelected = selected.length === 0;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Framework filter">
      <button
        onClick={() => {
          // Clear all selections = show all
          for (const fw of frameworks) {
            if (selected.includes(fw.slug)) onToggle(fw.slug);
          }
        }}
        className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
          allSelected
            ? "border-accent bg-accent-subtle text-accent"
            : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
        }`}
      >
        All
      </button>
      {frameworks.map((fw) => {
        const active = selected.includes(fw.slug);
        return (
          <button
            key={fw.slug}
            onClick={() => onToggle(fw.slug)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "border-accent bg-accent-subtle text-accent"
                : "border-border bg-surface-1 text-text-secondary hover:bg-surface-2"
            }`}
          >
            {fw.name}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/FrameworkFilterBar.tsx
git commit -m "feat(compliance): add FrameworkFilterBar component"
```

---

### Task 11: Create HeatmapCell Component

**Files:**
- Create: `apps/dashboard/components/compliance/HeatmapCell.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { scoreToColor, confidenceIndicator } from "./types";

interface HeatmapCellProps {
  score: number;
  total: number;
  controlCode: string;
  controlName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isSelected: boolean;
  onClick: () => void;
}

const COLOR_MAP: Record<string, string> = {
  green: "#22c55e",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#ef4444",
  gray: "#6b7280",
};

export function HeatmapCell({
  score,
  total,
  controlCode,
  controlName,
  x,
  y,
  width,
  height,
  isSelected,
  onClick,
}: HeatmapCellProps) {
  const color = score < 0 ? "gray" : scoreToColor(score);
  const fill = COLOR_MAP[color];
  const lowConfidence = total < 5;
  const patternId = `stripe-${controlCode}`;

  return (
    <g onClick={onClick} className="cursor-pointer" role="button" tabIndex={0}>
      {lowConfidence && (
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill={fill} opacity={0.6} />
            <line
              x1="0" y1="0" x2="0" y2="6"
              stroke="white"
              strokeWidth="2"
              opacity="0.3"
            />
          </pattern>
        </defs>
      )}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={lowConfidence ? `url(#${patternId})` : fill}
        opacity={0.85}
        stroke={isSelected ? "white" : "transparent"}
        strokeWidth={isSelected ? 2 : 0}
      />
      <title>{`${controlCode}: ${controlName} — ${score < 0 ? "N/A" : `${Math.round(score * 100)}%`}`}</title>
    </g>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/HeatmapCell.tsx
git commit -m "feat(compliance): add HeatmapCell SVG component with confidence overlay"
```

---

### Task 12: Create HeatmapGrid Component

**Files:**
- Create: `apps/dashboard/components/compliance/HeatmapGrid.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { FrameworkScore, SelectedCell } from "./types";
import { HeatmapCell } from "./HeatmapCell";

interface HeatmapGridProps {
  frameworks: FrameworkScore[];
  selectedFrameworks: string[];
  onSelectCell: (cell: SelectedCell | null) => void;
}

const CELL_W = 48;
const CELL_H = 36;
const CELL_GAP = 3;
const LABEL_W = 100;
const HEADER_H = 60;

export function HeatmapGrid({
  frameworks,
  selectedFrameworks,
  onSelectCell,
}: HeatmapGridProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const visible =
    selectedFrameworks.length === 0
      ? frameworks
      : frameworks.filter((fw) => selectedFrameworks.includes(fw.frameworkSlug));

  // Collect all unique control codes across visible frameworks
  const allControlCodes = Array.from(
    new Set(visible.flatMap((fw) => fw.controlScores.map((c) => c.controlCode))),
  );

  const gridW = LABEL_W + allControlCodes.length * (CELL_W + CELL_GAP);
  const gridH = HEADER_H + visible.length * (CELL_H + CELL_GAP);

  const handleClick = useCallback(
    (fw: FrameworkScore, code: string) => {
      const key = `${fw.frameworkSlug}:${code}`;
      if (selectedKey === key) {
        setSelectedKey(null);
        onSelectCell(null);
        return;
      }
      setSelectedKey(key);
      const cs = fw.controlScores.find((c) => c.controlCode === code);
      if (cs) {
        onSelectCell({
          frameworkSlug: fw.frameworkSlug,
          frameworkName: fw.frameworkName,
          controlCode: cs.controlCode,
          controlName: cs.controlName,
          score: cs.score,
          passing: cs.passing,
          failing: cs.failing,
          total: cs.total,
        });
      }
    },
    [selectedKey, onSelectCell],
  );

  // Keyboard navigation
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSelectedKey(null);
        onSelectCell(null);
      }
    }

    svg.addEventListener("keydown", handleKeyDown);
    return () => svg.removeEventListener("keydown", handleKeyDown);
  }, [onSelectCell]);

  if (visible.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-1">
        <p className="text-[13px] text-text-tertiary">
          No frameworks selected
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface-1 p-4">
      <svg
        ref={svgRef}
        width={gridW}
        height={gridH}
        viewBox={`0 0 ${gridW} ${gridH}`}
        className="block"
        role="grid"
        aria-label="Compliance heatmap"
        tabIndex={0}
      >
        {/* Column headers */}
        {allControlCodes.map((code, ci) => (
          <text
            key={code}
            x={LABEL_W + ci * (CELL_W + CELL_GAP) + CELL_W / 2}
            y={HEADER_H - 8}
            textAnchor="middle"
            className="fill-text-tertiary text-[10px]"
          >
            {code}
          </text>
        ))}

        {/* Rows */}
        {visible.map((fw, ri) => {
          const rowY = HEADER_H + ri * (CELL_H + CELL_GAP);
          // Build score lookup for this framework
          const scoreMap = new Map(
            fw.controlScores.map((c) => [c.controlCode, c]),
          );

          return (
            <g key={fw.frameworkSlug}>
              {/* Row label */}
              <text
                x={LABEL_W - 8}
                y={rowY + CELL_H / 2 + 4}
                textAnchor="end"
                className="fill-text-secondary text-[11px] font-medium"
              >
                {fw.frameworkName.length > 12
                  ? fw.frameworkSlug.toUpperCase()
                  : fw.frameworkName}
              </text>

              {/* Cells */}
              {allControlCodes.map((code, ci) => {
                const cs = scoreMap.get(code);
                const cellKey = `${fw.frameworkSlug}:${code}`;
                return (
                  <HeatmapCell
                    key={cellKey}
                    score={cs ? cs.score : -1}
                    total={cs ? cs.total : 0}
                    controlCode={code}
                    controlName={cs?.controlName ?? "Not assessed"}
                    x={LABEL_W + ci * (CELL_W + CELL_GAP)}
                    y={rowY}
                    width={CELL_W}
                    height={CELL_H}
                    isSelected={selectedKey === cellKey}
                    onClick={() => {
                      if (cs) handleClick(fw, code);
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/HeatmapGrid.tsx
git commit -m "feat(compliance): add HeatmapGrid SVG component"
```

---

### Task 13: Create ScoreBadge and VerdictBadge Components

**Files:**
- Create: `apps/dashboard/components/compliance/ScoreBadge.tsx`
- Create: `apps/dashboard/components/compliance/VerdictBadge.tsx`

**Step 1: Write ScoreBadge**

```typescript
import { scoreToColor } from "./types";

const BADGE_STYLES: Record<string, string> = {
  green: "bg-status-pass/15 text-status-pass border-status-pass/30",
  amber: "bg-amber-400/15 text-amber-500 border-amber-400/30",
  orange: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  red: "bg-status-fail/15 text-status-fail border-status-fail/30",
  gray: "bg-surface-2 text-text-tertiary border-border",
};

export function ScoreBadge({ score }: { score: number }) {
  const color = score < 0 ? "gray" : scoreToColor(score);
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12px] font-bold tabular-nums ${BADGE_STYLES[color]}`}
    >
      {score < 0 ? "N/A" : `${Math.round(score * 100)}%`}
    </span>
  );
}
```

**Step 2: Write VerdictBadge**

```typescript
import type { ComplianceVerdict } from "./types";

const VERDICT_STYLES: Record<ComplianceVerdict, string> = {
  compliant: "bg-status-pass/15 text-status-pass border-status-pass/30",
  partially_compliant: "bg-amber-400/15 text-amber-500 border-amber-400/30",
  needs_remediation: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  non_compliant: "bg-status-fail/15 text-status-fail border-status-fail/30",
};

const VERDICT_LABELS: Record<ComplianceVerdict, string> = {
  compliant: "Compliant",
  partially_compliant: "Partial",
  needs_remediation: "Remediation",
  non_compliant: "Non-compliant",
};

export function VerdictBadge({ verdict }: { verdict: ComplianceVerdict }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${VERDICT_STYLES[verdict]}`}
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}
```

**Step 3: Verify files compile**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/dashboard/components/compliance/ScoreBadge.tsx apps/dashboard/components/compliance/VerdictBadge.tsx
git commit -m "feat(compliance): add ScoreBadge and VerdictBadge components"
```

---

### Task 14: Create TrendSparkline Component

**Files:**
- Create: `apps/dashboard/components/compliance/TrendSparkline.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { ComplianceTrendPoint } from "@/lib/types";

interface TrendSparklineProps {
  data: ComplianceTrendPoint[];
}

export function TrendSparkline({ data }: TrendSparklineProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[80px] items-center justify-center text-[11px] text-text-tertiary">
        No trend data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    date: d.date,
    score: Math.round(d.score * 100),
  }));

  return (
    <div className="h-[80px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "11px",
            }}
            formatter={(value: number) => [`${value}%`, "Score"]}
            labelFormatter={(label: string) => new Date(label).toLocaleDateString()}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#6366f1"
            strokeWidth={1.5}
            fill="url(#sparkGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/TrendSparkline.tsx
git commit -m "feat(compliance): add TrendSparkline using Recharts AreaChart"
```

---

### Task 15: Create ControlDetailPanel Component

**Files:**
- Create: `apps/dashboard/components/compliance/ControlDetailPanel.tsx`

**Step 1: Write the component**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { SelectedCell } from "./types";
import type { ComplianceTrendPoint } from "@/lib/types";
import { ScoreBadge } from "./ScoreBadge";
import { TrendSparkline } from "./TrendSparkline";
import { scoreToVerdict } from "./types";

interface ControlDetailPanelProps {
  cell: SelectedCell | null;
  getTrends: (slug: string) => Promise<ComplianceTrendPoint[]>;
}

export function ControlDetailPanel({ cell, getTrends }: ControlDetailPanelProps) {
  const [trends, setTrends] = useState<ComplianceTrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cell) {
      setTrends([]);
      return;
    }
    setLoading(true);
    getTrends(cell.frameworkSlug).then((data) => {
      setTrends(data);
      setLoading(false);
    });
  }, [cell, getTrends]);

  if (!cell) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-8 text-center">
        <p className="text-[13px] text-text-tertiary">
          Click a cell to view control details
        </p>
      </div>
    );
  }

  const trendDelta =
    trends.length >= 2
      ? Math.round(
          (trends[trends.length - 1].score - trends[0].score) * 100,
        )
      : null;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[14px] font-bold text-text-primary">
            {cell.controlCode} — {cell.controlName}
          </h3>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            {cell.frameworkName}
          </p>
        </div>
        <ScoreBadge score={cell.score} />
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] text-text-tertiary">Verdict</p>
          <p className="text-[13px] font-semibold text-text-primary">
            {scoreToVerdict(cell.score)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Passing</p>
          <p className="font-mono text-[13px] font-semibold text-status-pass">
            {cell.passing}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Failing</p>
          <p className="font-mono text-[13px] font-semibold text-status-fail">
            {cell.failing}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-tertiary">Total</p>
          <p className="font-mono text-[13px] font-semibold text-text-primary">
            {cell.total}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-text-tertiary">
            30-day trend
          </p>
          {trendDelta !== null && (
            <span
              className={`text-[11px] font-semibold ${trendDelta >= 0 ? "text-status-pass" : "text-status-fail"}`}
            >
              {trendDelta >= 0 ? "+" : ""}
              {trendDelta}%
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex h-[80px] items-center justify-center">
            <span className="text-[11px] text-text-tertiary">Loading...</span>
          </div>
        ) : (
          <TrendSparkline data={trends} />
        )}
      </div>

      {cell.failing > 0 && (
        <a
          href={`/findings?framework=${cell.frameworkSlug}&control=${cell.controlCode}`}
          className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
        >
          View {cell.failing} findings &rarr;
        </a>
      )}
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/ControlDetailPanel.tsx
git commit -m "feat(compliance): add ControlDetailPanel with lazy trend loading"
```

---

### Task 16: Create GapAnalysisClient Wrapper

**Files:**
- Create: `apps/dashboard/components/compliance/GapAnalysisClient.tsx`

**Step 1: Write the client orchestrator component**

```typescript
"use client";

import { useState, useCallback } from "react";
import type { FrameworkScore } from "./types";
import type { ComplianceTrendPoint } from "@/lib/types";
import type { SelectedCell } from "./types";
import { SummaryCards } from "./SummaryCards";
import { FrameworkFilterBar } from "./FrameworkFilterBar";
import { HeatmapGrid } from "./HeatmapGrid";
import { ControlDetailPanel } from "./ControlDetailPanel";

interface GapAnalysisClientProps {
  frameworks: FrameworkScore[];
  trendData: Record<string, ComplianceTrendPoint[]>;
}

export function GapAnalysisClient({
  frameworks,
  trendData,
}: GapAnalysisClientProps) {
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const handleToggle = useCallback((slug: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug],
    );
  }, []);

  const getTrends = useCallback(
    async (slug: string): Promise<ComplianceTrendPoint[]> => {
      return trendData[slug] ?? [];
    },
    [trendData],
  );

  const filterOptions = frameworks.map((fw) => ({
    slug: fw.frameworkSlug,
    name: fw.frameworkName,
  }));

  return (
    <div className="space-y-5">
      <SummaryCards frameworks={frameworks} />

      <FrameworkFilterBar
        frameworks={filterOptions}
        selected={selectedFrameworks}
        onToggle={handleToggle}
      />

      <HeatmapGrid
        frameworks={frameworks}
        selectedFrameworks={selectedFrameworks}
        onSelectCell={setSelectedCell}
      />

      <ControlDetailPanel cell={selectedCell} getTrends={getTrends} />
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/GapAnalysisClient.tsx
git commit -m "feat(compliance): add GapAnalysisClient orchestrator component"
```

---

### Task 17: Create the Gap Analysis Page

**Files:**
- Create: `apps/dashboard/app/(dashboard)/compliance/gap-analysis/page.tsx`

**Step 1: Write the server component page**

```typescript
import { PageHeader } from "@/components/page-header";
import { getComplianceScores, getComplianceTrends } from "@/lib/api";
import { GapAnalysisClient } from "@/components/compliance/GapAnalysisClient";

export default async function GapAnalysisPage() {
  const frameworks = await getComplianceScores();

  // Pre-fetch trends for all frameworks in parallel
  const trendEntries = await Promise.all(
    frameworks.map(async (fw) => {
      const trends = await getComplianceTrends(fw.frameworkSlug);
      return [fw.frameworkSlug, trends] as const;
    }),
  );
  const trendData = Object.fromEntries(trendEntries);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gap Analysis"
        description="Visual overview of compliance control coverage across frameworks"
      />

      <GapAnalysisClient frameworks={frameworks} trendData={trendData} />
    </div>
  );
}
```

**Step 2: Verify file compiles**

Run: `cd apps/dashboard && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/dashboard/app/\(dashboard\)/compliance/gap-analysis/page.tsx
git commit -m "feat(compliance): add gap analysis page with server-side data fetching"
```

---

### Task 18: Write Integration Tests for HeatmapGrid

**Files:**
- Create: `apps/dashboard/components/compliance/__tests__/heatmap-grid.test.tsx`

**Step 1: Write the tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { MOCK_FRAMEWORK_SCORES } from "@/lib/mock-data";
import { scoreToColor } from "../types";

describe("HeatmapGrid data logic", () => {
  it("computes unique control codes across frameworks", () => {
    const allCodes = Array.from(
      new Set(
        MOCK_FRAMEWORK_SCORES.flatMap((fw) =>
          fw.controlScores.map((c) => c.controlCode),
        ),
      ),
    );
    // SOC2 has 12, ISO has 10, SLSA has 8, GDPR has 8 — many unique
    expect(allCodes.length).toBeGreaterThan(10);
    expect(allCodes).toContain("CC1.1");
    expect(allCodes).toContain("A.5");
    expect(allCodes).toContain("SL1");
  });

  it("filters frameworks by selected slugs", () => {
    const selected = ["soc2", "slsa"];
    const visible = MOCK_FRAMEWORK_SCORES.filter((fw) =>
      selected.includes(fw.frameworkSlug),
    );
    expect(visible).toHaveLength(2);
    expect(visible.map((fw) => fw.frameworkSlug)).toEqual(["soc2", "slsa"]);
  });

  it("shows all frameworks when no filter selected", () => {
    const selected: string[] = [];
    const visible =
      selected.length === 0
        ? MOCK_FRAMEWORK_SCORES
        : MOCK_FRAMEWORK_SCORES.filter((fw) =>
            selected.includes(fw.frameworkSlug),
          );
    expect(visible).toHaveLength(MOCK_FRAMEWORK_SCORES.length);
  });

  it("maps scores to correct heatmap colors", () => {
    const soc2 = MOCK_FRAMEWORK_SCORES.find((fw) => fw.frameworkSlug === "soc2")!;
    const cc8_1 = soc2.controlScores.find((c) => c.controlCode === "CC8.1")!;
    expect(cc8_1.score).toBe(0.97);
    expect(scoreToColor(cc8_1.score)).toBe("green");

    const cc6_3 = soc2.controlScores.find((c) => c.controlCode === "CC6.3")!;
    expect(cc6_3.score).toBe(0.55);
    expect(scoreToColor(cc6_3.score)).toBe("red");
  });
});

describe("SummaryCards data logic", () => {
  it("computes average score across all frameworks", () => {
    const avg =
      MOCK_FRAMEWORK_SCORES.reduce((sum, fw) => sum + fw.score, 0) /
      MOCK_FRAMEWORK_SCORES.length;
    expect(Math.round(avg * 100)).toBeGreaterThan(0);
    expect(Math.round(avg * 100)).toBeLessThan(100);
  });

  it("counts met vs unmet controls", () => {
    const total = MOCK_FRAMEWORK_SCORES.reduce(
      (sum, fw) => sum + fw.controlScores.length,
      0,
    );
    const met = MOCK_FRAMEWORK_SCORES.reduce(
      (sum, fw) =>
        sum + fw.controlScores.filter((c) => c.score >= 0.80).length,
      0,
    );
    expect(met).toBeGreaterThan(0);
    expect(total - met).toBeGreaterThan(0);
  });
});
```

**Step 2: Run the tests**

Run: `cd apps/dashboard && npx vitest run components/compliance/__tests__/heatmap-grid.test.tsx`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add apps/dashboard/components/compliance/__tests__/heatmap-grid.test.tsx
git commit -m "test(compliance): add integration tests for heatmap data logic"
```

---

### Task 19: Verify Full Build and All Tests

**Step 1: Run all dashboard tests**

Run: `cd apps/dashboard && npx vitest run`
Expected: All tests pass (existing + new compliance tests)

**Step 2: Verify the page builds**

Run: `cd apps/dashboard && npx next build 2>&1 | tail -20`
Expected: Build succeeds, `/compliance/gap-analysis` appears in output

**Step 3: Commit any fixes if needed**

---

### Task 20: Visual Verification

**Step 1: Start the dev server**

Run: `cd apps/dashboard && npx next dev &`

**Step 2: Verify page loads**

Navigate to `http://localhost:3000/compliance/gap-analysis`
Expected:
- PageHeader with "Gap Analysis" title
- 4 summary cards (Score, Met, Unmet, Frameworks)
- Framework filter pills (All, SOC 2, ISO 27001, SLSA, GDPR)
- SVG heatmap grid with colored cells
- Clicking a cell shows ControlDetailPanel with trend sparkline
- Sidebar shows "Gap Analysis" nav item under Compliance section

**Step 3: Stop the dev server**

---

## Summary

| Task | Component | Type |
|------|-----------|------|
| 1 | Compliance types | Types |
| 2 | Mock compliance data | Data |
| 3 | Compliance API functions | API |
| 4 | Nav item + route permission | Navigation |
| 5 | Grid icon | Icon |
| 6 | Recharts dependency | Deps |
| 7 | Shared compliance types | Types |
| 8 | Scoring helper tests | Test |
| 9 | SummaryCards | Component |
| 10 | FrameworkFilterBar | Component |
| 11 | HeatmapCell | Component |
| 12 | HeatmapGrid | Component |
| 13 | ScoreBadge + VerdictBadge | Component |
| 14 | TrendSparkline | Component |
| 15 | ControlDetailPanel | Component |
| 16 | GapAnalysisClient | Component |
| 17 | Gap Analysis page | Page |
| 18 | Integration tests | Test |
| 19 | Full build verification | Verification |
| 20 | Visual verification | Verification |
