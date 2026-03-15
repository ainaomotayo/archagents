# P10: Gap Analysis Visualization Page — Design Document

**Date**: 2026-03-15
**Status**: Approved
**Author**: Claude Opus 4.6

## Overview

Add a gap analysis visualization page at `/compliance/gap-analysis` that displays compliance control coverage as an interactive SVG heatmap. Each cell represents a control within a framework, colored by score (green→amber→orange→red) with confidence overlays for sparse data.

## Enterprise Approach Decisions

### Algorithms: Hybrid Weighted Linear + Confidence Bands

- **Primary**: Existing weighted linear scoring from `@sentinel/compliance` (`scoreFramework()`, `scoreControl()`)
- **Enhancement**: Confidence indicator `1 - 1/√(total+1)` for cells with <5 findings → diagonal stripe pattern
- **Rejected**: Bayesian scoring (hard to explain to auditors), pure linear without confidence (misleading for sparse data)

### Data Structures: Sparse Map + Lazy Materialization

- API returns `Map<frameworkSlug, Map<controlCode, ControlScore>>` via existing endpoints
- Client builds heatmap grid from sparse map — only non-empty cells rendered
- **Rejected**: Pre-materialized matrix (too rigid for custom frameworks), flat array (wasteful client-side pivoting)

### System Design: Snapshot + On-Demand Delta

- Default: serve from latest `ComplianceSnapshot.controlBreakdown` (fast, <50ms)
- "Refresh" button triggers live `GET /v1/compliance/assess/:id` for fresh scores
- Trend sparklines from `compliance_trends` materialized view
- **Rejected**: Pure real-time (doesn't scale past 50K findings), pure pre-computed (up to 24h stale)

### Software Design: Custom SVG Heatmap + Recharts for Sparklines

- Heatmap: custom SVG (colored rectangles in grid) — ~5KB vs 45KB for Recharts
- Sparklines: Recharts `<AreaChart>` for trend curves (axes, responsive sizing)
- Shared primitives: `<ScoreBadge>`, `<VerdictBadge>` with Tailwind
- **Rejected**: Monolithic page (untestable), full Recharts for heatmap (overkill for rectangles)

## Page Layout

```
┌─────────────────────────────────────────────────────────┐
│ ← Compliance    Gap Analysis                  [Refresh] │
│ Visual overview of compliance control coverage          │
├────────┬────────┬────────┬──────────────────────────────┤
│ Score  │ Met    │ Unmet  │ Frameworks                   │
│ 78%    │ 64     │ 18     │ 7 active                     │
├────────┴────────┴────────┴──────────────────────────────┤
│ Framework Filter: [All] [SOC2] [ISO27001] [SLSA] ...    │
├─────────────────────────────────────────────────────────┤
│                    HEATMAP GRID                          │
│         CC1.1  CC2.1  CC3.1  CC4.1  CC5.1  CC6.1 ...  │
│ SOC2    ██████ ██████ ██████ ██████ ██████ ██████       │
│ ISO27k  ██████ ██████ ██████ ██████ ██████ ██████       │
│ SLSA    ██████ ██████ ██████ ██████ ██████              │
│ GDPR    ██████ ██████ ██████ ██████                     │
├─────────────────────────────────────────────────────────┤
│ Selected: CC6.1 — Logical Access Controls    Score: 72% │
│ ┌─────────────┐  Passing: 18  Failing: 7  Weight: 3.0  │
│ │ ▁▂▃▅▆▇█▇▆▅ │  Trend: +4% over 30 days               │
│ │  30d trend  │  Matched findings: [View 7 findings →]  │
│ └─────────────┘                                         │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

```
Next.js Server Component (page.tsx)
  ├── GET /v1/compliance/scores       → all framework scores + controlBreakdown
  ├── GET /v1/compliance/frameworks   → framework + control metadata
  └── Pass as props to client components

Client Components:
  ├── <HeatmapGrid>         → SVG grid, colored cells, click to select
  ├── <FrameworkFilterBar>  → pill buttons to filter visible frameworks
  ├── <SummaryCards>        → score/met/unmet/frameworks counts
  └── <ControlDetailPanel>  → selected control detail + trend sparkline
        └── GET /v1/compliance/trends/:fwId  → lazy load on selection
```

## Heatmap Color Scale

| Score Range | Color | CSS Variable | Verdict |
|-------------|-------|-------------|---------|
| 95-100% | Green | `status-pass` | Compliant |
| 80-94% | Amber | `amber-400` | Partially compliant |
| 60-79% | Orange | `orange-500` | Needs remediation |
| 0-59% | Red | `status-fail` | Non-compliant |
| No data | Gray | `surface-2` | Not assessed |

Cells with `total < 5` findings get a diagonal stripe SVG pattern to indicate low confidence.

## Component Tree

```
apps/dashboard/
├── app/(dashboard)/compliance/
│   ├── page.tsx                    → redirect to gap-analysis
│   └── gap-analysis/
│       └── page.tsx                → server component, data fetch
├── components/compliance/
│   ├── HeatmapGrid.tsx             → SVG heatmap (client component)
│   ├── HeatmapCell.tsx             → individual cell with tooltip
│   ├── FrameworkFilterBar.tsx      → filter pills
│   ├── SummaryCards.tsx            → 4 stat cards
│   ├── ControlDetailPanel.tsx      → selected control details
│   ├── TrendSparkline.tsx          → mini Recharts AreaChart
│   ├── ScoreBadge.tsx              → colored score indicator
│   ├── VerdictBadge.tsx            → compliant/partial/non badge
│   └── types.ts                    → shared types
```

## API Endpoints (All Existing)

| Endpoint | Purpose | Latency |
|----------|---------|---------|
| `GET /v1/compliance/scores` | All framework scores + control breakdowns | ~50ms |
| `GET /v1/compliance/frameworks` | Framework metadata + control definitions | ~20ms |
| `GET /v1/compliance/assess/:fwId` | Live re-assessment (refresh) | ~200ms |
| `GET /v1/compliance/trends/:fwId` | Historical daily scores | ~30ms |

## Dependencies

- **Add**: `recharts` ^2.15 (for TrendSparkline — axes, curves, responsive)
- **No other new deps** — heatmap is custom SVG + Tailwind

## Key Interactions

1. **Hover cell** → tooltip: control name, score %, passing/failing counts
2. **Click cell** → ControlDetailPanel shows full detail + trend sparkline
3. **Framework filter** → heatmap shows only selected framework(s)
4. **Refresh** → live re-assessment, updates heatmap
5. **"View N findings →"** → navigates to `/findings?control=X&framework=Y`
6. **Keyboard**: Arrow keys navigate cells, Enter selects, Escape deselects

## Testing

- **Unit**: color mapping, score→verdict, confidence calculation, summary aggregation
- **Integration**: HeatmapGrid renders correct cells from mock data
- **Component**: ControlDetailPanel with/without trend data
- **E2E**: page load → cells visible → click cell → detail panel renders
