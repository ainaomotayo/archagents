# Visual Policy Rule Builder — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Replace raw YAML editing with a drag-and-drop nested block editor for unified policy configuration (generic policies + approval policies), with progressive disclosure for both compliance managers and security engineers.

**Date:** 2026-03-14

---

## 1. Context & Current State

Sentinel has two distinct policy systems:

1. **Generic Policies** — YAML-based `rules[]` stored in the `policies` table. Each rule has `id`, `severity`, `enabled`, `description`, `threshold`. Edited via a bare `<textarea>` with line numbers (`policy-editor.tsx`) and regex-based validation (`policy-validator.tsx`).

2. **Approval Policies** — Strategy-based configs in the `approval_policies` table. Four built-in strategies: `risk_threshold`, `category_block`, `license_review`, `always_review`. Evaluated by `packages/assessor/src/approval-policy.ts` using a strategy pattern.

**Problems with the current approach:**
- YAML editing is error-prone for non-technical compliance managers
- No visual feedback on what a policy will match
- Two disconnected UIs for related policy concepts
- No simulation/preview capability
- No undo/redo support

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Unified builder for both policy types | Single mental model for users, shared evaluation engine |
| Persona | Progressive disclosure (simple + advanced) | Compliance managers get card-based builder; security engineers get YAML preview + expression editor |
| Visual paradigm | Nested block editor (Blockly-style) | Constrained to valid logic, visually maps to AND/OR/NOT composition, middle ground between linear lists and node graphs |

---

## 3. Algorithms — Rule Evaluation & Matching Engine

### Three Approaches Evaluated

#### Approach 1: Recursive AST Interpreter
Single-pass depth-first traversal of the block tree. Each node evaluates to a boolean. O(n) performance, excellent debuggability, but no short-circuit optimization.

#### Approach 2: Compiled Decision Table (Rete-inspired)
At save time, compile the block tree into a flat decision table with pre-indexed conditions. O(1) amortized lookups. Excellent for 1000+ rules but adds compilation complexity and makes debugging harder (compiled form doesn't map cleanly back to visual blocks). Over-engineered for Sentinel's typical 5-50 rule policies.

#### Approach 3: Predicate Composition with Short-Circuit Evaluation
Each block compiles to a composable predicate function `(input) => EvalResult`. AND/OR/NOT are higher-order combinators with lazy short-circuit evaluation. Produces a trace log alongside the boolean result for visual "which blocks fired" highlighting.

```typescript
type Predicate = (input: PolicyInput) => EvalResult;
interface EvalResult { match: boolean; trace: TraceNode[]; }

const and = (...preds: Predicate[]): Predicate => (input) => {
  const trace: TraceNode[] = [];
  for (const p of preds) {
    const r = p(input);
    trace.push(...r.trace);
    if (!r.match) return { match: false, trace }; // short-circuit
  }
  return { match: true, trace };
};
```

### Chosen: Hybrid of Approach 3 + Approach 1's trace model

**Why hybrid:** Predicate composition gives short-circuit performance gains over naive AST walking while maintaining the 1:1 block-to-trace debuggability of the recursive interpreter. Trace log enables visual highlighting of which blocks matched during simulation.

**Why not Approach 2:** Sentinel policies evaluate per-scan (minutes apart), not per-millisecond. The debugging cost of compiled decision tables outweighs the performance gain. Policies are typically 5-50 rules — Rete compilation overhead is not justified.

**Why not pure Approach 1:** Short-circuit evaluation is free to implement and meaningfully improves performance when policies have early-exit conditions (e.g., `if branch != "main" -> skip all`).

---

## 4. DSA — Data Structures for the Rule Tree

### Three Approaches Evaluated

#### Approach 1: Adjacency List Tree (Flat Array with Parent Pointers)
Every block is a node in a flat array with `parentId` and `position`. Tree reconstructed by grouping children under parents. Database-friendly, O(1) insert/delete, but requires reconstruction for every render cycle.

#### Approach 2: Nested Document Tree (Recursive Children)
Recursive data structure where each GroupNode contains its children inline. The data structure IS the visual model. TypeScript discriminated unions give compile-time safety. Serializes directly to JSON. Immutable updates require cloning the path to root — O(depth) per drag-drop.

```typescript
interface GroupNode {
  id: string;
  type: "group";
  operator: "AND" | "OR" | "NOT";
  children: RuleNode[];
}

interface ConditionNode {
  id: string;
  type: "condition";
  field: string;
  comparator: "eq" | "in" | "gt" | "lt" | "matches";
  value: unknown;
}

interface ActionNode {
  id: string;
  type: "action";
  actionType: string;
  config: Record<string, unknown>;
}

type RuleNode = GroupNode | ConditionNode | ActionNode;
```

#### Approach 3: Hybrid Zipper / Indexed Tree
Nested document tree augmented with a flat `Map<id, node>` index for O(1) lookups. Mutations happen on the index, nested tree lazily reconstructed. Zipper cursor for keyboard navigation. Excellent performance but dual-representation sync complexity.

### Chosen: Hybrid of Approach 2 (canonical) + Approach 3's index as derived state

**Why hybrid:** The nested document tree is the canonical data model — serializes to JSON, maps directly to visual nesting, TypeScript discriminated unions give exhaustive type safety. A derived `Map<id, node>` index (computed via `useMemo`) provides O(1) lookups for drag-drop hit testing, evaluation trace highlighting, and keyboard navigation.

```typescript
// Canonical: nested tree (serialized to DB)
const tree: GroupNode = { ... };
// Derived: flat index (computed, never serialized)
const index = useMemo(() => buildIndex(tree), [tree]);
```

**Why not pure Approach 1:** Flat array requires reconstruction for every render. The visual builder needs nested structure constantly.

**Why not pure Approach 3:** Zipper's mutable-index-with-lazy-rebuild adds sync complexity unnecessary when React's `useReducer` + immutable updates handle state transitions cleanly for 50-200 node trees.

---

## 5. System Design — Architecture

### Three Approaches Evaluated

#### Approach 1: Thin Client / Server-Canonical
Visual builder is render-only. All validation, compilation, versioning server-side. Excellent consistency and security, but no real-time validation feedback during editing.

#### Approach 2: Fat Client / Client-Canonical
Full policy engine in the browser. Instant feedback, offline-capable. But client and server can diverge, and client-generated compiled forms are a security risk for a policy enforcement system.

#### Approach 3: Shared-Core / Isomorphic Engine
Policy engine in a shared TypeScript package (`@sentinel/policy-engine`) imported by both dashboard and API. Client uses it for real-time feedback; server uses same code for authoritative validation.

### Chosen: Hybrid of Approach 3 + Approach 1's server authority

**Why hybrid:** Isomorphic engine gives real-time client feedback AND server-side authority. No logic duplication, no divergence risk. Server always re-validates on save (defense in depth), but client runs the same validation for instant UX.

```
packages/
  policy-engine/           <-- NEW shared package
    src/
      types.ts             <-- RuleNode, GroupNode, ConditionNode, ActionNode
      validate.ts          <-- validateTree()
      compile-predicates.ts <-- compileToPredicates()
      compile-yaml.ts      <-- compileToYaml()
      simulate.ts          <-- simulate(tree, sampleInput)
      diff.ts              <-- diffTrees(a, b)
  assessor/                <-- EXISTING, imports from policy-engine
  compliance/              <-- EXISTING, imports from policy-engine
```

**Why not pure Approach 1:** Save-time-only validation is unacceptable for a drag-and-drop builder.

**Why not pure Approach 2:** Client-canonical is a security risk. Server must be authoritative for policy enforcement.

**Data flow:**

```
User drags block -> tree reducer -> new tree state
                                 -> useMemo: rebuild index
                                 -> useMemo: validateTree() (shared engine)
                                 -> useMemo: compileToYaml() (YAML preview)

User clicks "Test" -> simulate(tree, sampleInput) -> trace highlights on canvas

User clicks "Save" -> POST /v1/policies { tree }
                   -> API: validateTree() (re-validate, same code)
                   -> API: compileToPredicates() (for runtime eval)
                   -> API: store tree JSON + compiled form
                   -> API: create PolicyVersion
                   -> API: publish policy_changed event
```

---

## 6. Software Design — Component Architecture

### Three Approaches Evaluated

#### Approach 1: Monolithic Component with Centralized Store
Single Zustand store owns all state. Simple initially but becomes a god object as features grow. Poor separation of concerns, poor team scalability.

#### Approach 2: Plugin Architecture with Block Registry
Full plugin system where each block type is a self-contained plugin with its own schema, renderer, property editor, validator, and evaluator. Excellent extensibility but over-engineered for the UI shell.

#### Approach 3: Compound Component Pattern with React Context Layers
Layered contexts (tree, drag, selection, validation) with composable sub-components. Progressive disclosure is first-class — simple vs advanced mode is which children render. No external state library needed.

### Chosen: Hybrid of Approach 3 (Compound Components) + Approach 2's Block Registry

**Why hybrid:** Compound components structure the builder's UI and state management cleanly. Block types use a lightweight registry for extensibility — adding a new condition type is a single file registration with zero changes to existing code.

```typescript
<PolicyBuilder.Provider tree={tree} onChange={onTreeChange} registry={blockRegistry}>
  <PolicyBuilder.DragProvider>
    <PolicyBuilder.SelectionProvider>
      <PolicyBuilder.ValidationProvider engine={policyEngine}>

        <PolicyBuilder.Palette />
        <PolicyBuilder.Canvas />
        <PolicyBuilder.PropertyPanel />
        <PolicyBuilder.ValidationPanel />

        {advancedMode && <PolicyBuilder.YamlPreview />}
        {advancedMode && <PolicyBuilder.SimulationPanel />}

      </PolicyBuilder.ValidationProvider>
    </PolicyBuilder.SelectionProvider>
  </PolicyBuilder.DragProvider>
</PolicyBuilder.Provider>
```

**Why not pure Approach 1:** God-store anti-pattern. Builder will grow (simulation, diff, templates).

**Why not pure Approach 2:** Full plugin architecture is over-engineered for the UI shell. Only block types need plugin extensibility.

**Why not pure Approach 3:** Without registry, adding a new condition type requires modifying switch statements in 4+ files.

### Block Plugin Contract

```typescript
interface BlockPlugin<C = unknown> {
  type: string;                    // "condition:severity", "action:block"
  category: "condition" | "group" | "action";
  label: string;
  icon: React.ComponentType;
  defaultConfig: C;
  schema: ZodType<C>;
  Renderer: React.ComponentType<{ node: RuleNode; config: C }>;
  PropertyEditor: React.ComponentType<{ config: C; onChange: (c: C) => void }>;
  evaluate: (config: C, input: PolicyInput) => EvalResult;
  toYaml: (config: C) => string;
}
```

### Built-in Block Plugins (12 total)

**Conditions (5):**
| Plugin | Maps To | Config |
|--------|---------|--------|
| `condition:severity` | Generic rules + category_block | `{ severities: string[] }` |
| `condition:category` | Generic rules + category_block | `{ categories: string[] }` |
| `condition:risk-score` | risk_threshold strategy | `{ operator: "gt"\|"lt"\|"between", value: number, upperBound?: number }` |
| `condition:branch` | always_review strategy | `{ patterns: string[] }` |
| `condition:license` | license_review strategy | `{ licenses: string[] }` |

**Groups (3):**
| Plugin | Purpose |
|--------|---------|
| `group:and` | All children must match |
| `group:or` | Any child must match |
| `group:not` | Negate single child |

**Actions (4):**
| Plugin | Config |
|--------|--------|
| `action:block` | `{ reason: string }` |
| `action:review` | `{ assigneeRole, slaHours, escalateAfterHours, expiryAction }` |
| `action:notify` | `{ channel: "email"\|"slack", recipients: string[] }` |
| `action:allow` | `{}` (explicit pass-through) |

### Tree State Reducer

```typescript
type TreeAction =
  | { type: "ADD_NODE"; parentId: string; node: RuleNode; position: number }
  | { type: "MOVE_NODE"; nodeId: string; newParentId: string; position: number }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "UPDATE_NODE"; nodeId: string; patch: Partial<RuleNode> }
  | { type: "SET_OPERATOR"; nodeId: string; operator: "AND" | "OR" | "NOT" }
  | { type: "UNDO" }
  | { type: "REDO" };
```

Undo/redo: snapshot entire tree on each action, bounded to 50 entries.

---

## 7. Mapping Existing Approval Strategies to Block Trees

The 4 existing approval strategies map cleanly to block compositions:

**risk_threshold** `{ autoPassBelow: 30, autoBlockAbove: 70 }`:
```
OR
  AND
    condition:risk-score { operator: "gt", value: 70 }
    action:block { reason: "Risk score exceeds threshold" }
  AND
    condition:risk-score { operator: "between", value: 30, upperBound: 70 }
    action:review { assigneeRole: "manager", slaHours: 24 }
```

**category_block** `{ categories: ["secret-detection"], severities: ["critical"] }`:
```
AND
  condition:category { categories: ["secret-detection"] }
  condition:severity { severities: ["critical"] }
  action:block { reason: "Critical secret detection finding" }
```

**license_review** `{ licenses: ["GPL-3.0", "AGPL-3.0"] }`:
```
AND
  condition:license { licenses: ["GPL-3.0", "AGPL-3.0"] }
  action:review { assigneeRole: "manager", slaHours: 48 }
```

**always_review** `{ branches: ["main", "release/*"] }`:
```
AND
  condition:branch { patterns: ["main", "release/*"] }
  action:review { assigneeRole: "manager", slaHours: 24 }
```

---

## 8. Progressive Disclosure Modes

### Simple Mode (Default)
- Block palette with labeled cards (drag to canvas)
- Nested block canvas with snap-together composition
- Property panel for selected block configuration
- Validation panel showing errors/warnings
- No YAML visible, no simulation

### Advanced Mode (Toggle)
- Everything in simple mode, plus:
- Live YAML preview pane (read-only, auto-generated from tree)
- Simulation panel: paste sample scan JSON, see which blocks fire
- Evaluation trace: blocks highlight green/red based on simulation result
- Raw YAML editor tab: edit YAML directly, bidirectional sync with block tree
- Diff viewer: compare current tree against last saved version

---

## 9. API Changes

### Updated Policy Payload

The `rules` field on the `policies` table currently stores raw YAML as JSON. It will now store the block tree:

```typescript
// POST /v1/policies
{
  name: string;
  rules: GroupNode;           // was: string (YAML)
  format: "tree" | "yaml";   // migration: existing policies have format: "yaml"
}
```

Backward compatibility: existing YAML policies continue to work. The API accepts both `format: "yaml"` (raw string) and `format: "tree"` (block tree JSON). The visual builder always sends `format: "tree"`.

### New Endpoint: Simulation

```
POST /v1/policies/simulate
{
  tree: GroupNode;
  input: PolicyInput;   // sample scan data
}
Response: {
  match: boolean;
  trace: TraceNode[];   // maps to block IDs
}
```

### New Endpoint: YAML Preview

```
POST /v1/policies/compile-yaml
{
  tree: GroupNode;
}
Response: {
  yaml: string;
  valid: boolean;
}
```

Note: these endpoints are also available client-side via the shared `@sentinel/policy-engine` package, but the API endpoints exist for non-browser consumers (CLI, CI/CD integrations).

---

## 10. Database Migration

```sql
-- Add format column to policies table
ALTER TABLE policies ADD COLUMN format TEXT NOT NULL DEFAULT 'yaml';

-- Add tree_rules column for structured storage
ALTER TABLE policies ADD COLUMN tree_rules JSONB;

-- Index for format-based queries
CREATE INDEX idx_policies_format ON policies(org_id, format);
```

Existing policies retain `format = 'yaml'` and `rules` column. New policies from the visual builder use `format = 'tree'` and `tree_rules` column.

---

## 11. New Dependencies

```json
{
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "zod": "^3.23.0"
}
```

- **@dnd-kit**: Modern React drag-and-drop library. Chosen over `@hello-pangea/dnd` (deprecated `react-beautiful-dnd` fork) for better tree support, keyboard accessibility, and active maintenance. Chosen over `react-dnd` for simpler API.
- **zod**: Schema validation for block configs. Already used pattern in the assessor package.

---

## 12. File Structure

```
packages/
  policy-engine/                          <-- NEW shared package
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts                            <-- RuleNode, GroupNode, tree types
      validate.ts                         <-- validateTree()
      compile-predicates.ts               <-- tree -> evaluation functions
      compile-yaml.ts                     <-- tree -> YAML string
      simulate.ts                         <-- evaluate tree against sample input
      diff.ts                             <-- structural diff between trees
    __tests__/
      validate.test.ts
      compile-predicates.test.ts
      compile-yaml.test.ts
      simulate.test.ts

apps/dashboard/
  components/
    policy-builder/
      index.ts                            <-- public exports
      PolicyBuilder.tsx                   <-- compound component root
      contexts/
        tree-context.tsx                  <-- tree state + reducer + undo/redo
        drag-context.tsx                  <-- @dnd-kit integration
        selection-context.tsx             <-- selected node + keyboard nav
        validation-context.tsx            <-- live validation via policy-engine
      components/
        Palette.tsx                       <-- draggable block type cards
        Canvas.tsx                        <-- nested block rendering + drop zones
        BlockCard.tsx                     <-- single block visual (delegates to plugin)
        DropZone.tsx                      <-- visual drop indicator
        PropertyPanel.tsx                 <-- selected block config editor
        YamlPreview.tsx                   <-- live YAML output (advanced)
        SimulationPanel.tsx               <-- test against sample scan (advanced)
        ValidationPanel.tsx               <-- error/warning/info display
        ModeToggle.tsx                    <-- simple/advanced switch
      blocks/
        registry.ts                       <-- BlockRegistry class + built-in registration
        types.ts                          <-- BlockPlugin interface
        severity-condition.tsx
        category-condition.tsx
        risk-score-condition.tsx
        branch-condition.tsx
        license-condition.tsx
        and-group.tsx
        or-group.tsx
        not-group.tsx
        block-action.tsx
        review-action.tsx
        notify-action.tsx
        allow-action.tsx
  app/(dashboard)/
    policies/
      page.tsx                            <-- MODIFY: add "Visual" / "YAML" toggle
      new/
        page.tsx                          <-- MODIFY: use PolicyBuilder instead of textarea
      [id]/
        page.tsx                          <-- MODIFY: use PolicyBuilder for tree-format policies

apps/api/
  src/
    services/
      policy-service.ts                   <-- NEW: validation + compilation service
    routes/
      policies.ts                         <-- MODIFY: accept tree format, add simulate endpoint
```

---

## 13. Testing Strategy

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| `@sentinel/policy-engine` | Vitest (unit) | 95%+ — pure functions, no DOM |
| Block plugins (schema, evaluate, toYaml) | Vitest (unit) | 90%+ — isolated plugin logic |
| Tree reducer (add, move, delete, undo) | Vitest (unit) | 95%+ — deterministic state transitions |
| Context providers | Testing Library (integration) | 80%+ — render with mock providers |
| Full builder (drag-drop, mode toggle) | Playwright (e2e) | Key flows: create policy, drag blocks, save |
| API endpoints (simulate, save tree) | Vitest (integration) | Existing pattern from api-integration.test.ts |

---

## 14. Migration Path

1. **Phase 1:** Ship `@sentinel/policy-engine` package + visual builder as opt-in. Existing YAML editor remains default. New policies can be created in either mode.
2. **Phase 2:** Add "Convert to Visual" button on YAML-format policies. One-way migration (YAML -> tree). Visual builder becomes default for new policies.
3. **Phase 3:** Deprecate raw YAML editor. All policies editable in visual builder. Advanced mode still shows YAML preview (read-only or bidirectional sync).

No breaking changes. Existing YAML policies continue to work throughout all phases.
