# P9: Visual Policy Rule Builder — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw YAML editing with a drag-and-drop nested block editor for unified policy configuration, with progressive disclosure for both compliance managers and security engineers.

**Architecture:** New `@sentinel/policy-engine` shared package (isomorphic) + compound component `PolicyBuilder` in the dashboard + API endpoints for simulation/compile. `@dnd-kit` for drag-and-drop. Block registry pattern for extensible condition/action types.

**Tech Stack:** TypeScript, React 19, Next.js 15, `@dnd-kit/core` + `@dnd-kit/sortable`, `zod`, Vitest, Tailwind CSS 4. Existing: `@sentinel/db` (Prisma), `@sentinel/shared`, Fastify 5 API.

**Important context:**
- Policy model: `packages/db/prisma/schema.prisma` lines 140-173 — `Policy { id, orgId, name, rules: Json, version }` + `PolicyVersion`
- Existing YAML editor: `apps/dashboard/components/policy-editor.tsx` (bare textarea + line numbers)
- Existing validator: `apps/dashboard/components/policy-validator.tsx` (regex-based YAML checks)
- Policy pages: `apps/dashboard/app/(dashboard)/policies/{page,new/page,[id]/page,[id]/actions}.tsx`
- Server actions: `apiPost("/v1/policies", { name, rules })` and `apiPut("/v1/policies/{id}", { name, rules })`
- Package pattern: `packages/shared/` — `type: "module"`, `tsc` build, extends `../../tsconfig.base.json`
- Dashboard deps: React 19, Next.js 15, Tailwind 4, no state library (use React built-ins)
- Design doc: `docs/plans/2026-03-14-p9-visual-policy-builder-design.md`

---

### Task 1: Create @sentinel/policy-engine package — types and validation

**Files:**
- Create: `packages/policy-engine/package.json`
- Create: `packages/policy-engine/tsconfig.json`
- Create: `packages/policy-engine/src/index.ts`
- Create: `packages/policy-engine/src/types.ts`
- Create: `packages/policy-engine/src/validate.ts`
- Create: `packages/policy-engine/__tests__/validate.test.ts`

**Details:**

`package.json`: Follow `@sentinel/shared` pattern — `name: "@sentinel/policy-engine"`, `type: "module"`, `main: "dist/index.js"`, `types: "dist/index.d.ts"`, scripts `build: tsc`, `test: vitest run`. Dependencies: `zod ^3.23.0`. DevDependencies: `typescript ^5.7`, `vitest ^3.0`.

`tsconfig.json`: Extend `../../tsconfig.base.json`, `outDir: "dist"`, `rootDir: "src"`.

`types.ts`: Define the core discriminated union types from the design doc:
```typescript
// Core tree nodes
interface GroupNode { id: string; type: "group"; operator: "AND" | "OR" | "NOT"; children: RuleNode[]; }
interface ConditionNode { id: string; type: "condition"; conditionType: string; config: Record<string, unknown>; }
interface ActionNode { id: string; type: "action"; actionType: string; config: Record<string, unknown>; }
type RuleNode = GroupNode | ConditionNode | ActionNode;

// Evaluation
interface EvalResult { match: boolean; trace: TraceNode[]; }
interface TraceNode { nodeId: string; match: boolean; short_circuited?: boolean; }

// Policy input for evaluation
interface PolicyInput { severity?: string; category?: string; riskScore?: number; branch?: string; license?: string; [key: string]: unknown; }

// Validation
interface ValidationIssue { nodeId: string; level: "error" | "warning"; message: string; }
```

`validate.ts`: Export `validateTree(tree: GroupNode): ValidationIssue[]`. Rules:
1. Root must be a GroupNode
2. NOT groups must have exactly 1 child
3. AND/OR groups must have >= 1 child
4. Every node must have a non-empty `id`
5. No duplicate IDs in the tree
6. At least one ActionNode must exist somewhere in the tree
7. ConditionNodes must have a non-empty `conditionType`
8. ActionNodes must have a non-empty `actionType`

`validate.test.ts`: Test each validation rule — valid tree passes, each invalid case produces expected error. Minimum 12 test cases.

`index.ts`: Re-export everything from `types.ts` and `validate.ts`.

**Tests:** `cd packages/policy-engine && npx vitest run`

---

### Task 2: Policy engine — predicate compiler and YAML compiler

**Files:**
- Create: `packages/policy-engine/src/compile-predicates.ts`
- Create: `packages/policy-engine/src/compile-yaml.ts`
- Create: `packages/policy-engine/__tests__/compile-predicates.test.ts`
- Create: `packages/policy-engine/__tests__/compile-yaml.test.ts`

**Details:**

`compile-predicates.ts`: Export `compileToPredicates(tree: GroupNode): Predicate` where `type Predicate = (input: PolicyInput) => EvalResult`. Implements the hybrid predicate composition from the design:
- `GroupNode AND`: short-circuit — return false on first non-matching child
- `GroupNode OR`: short-circuit — return true on first matching child
- `GroupNode NOT`: negate single child
- `ConditionNode`: dispatch by `conditionType`:
  - `"severity"`: `config.severities` includes `input.severity`
  - `"category"`: `config.categories` includes `input.category`
  - `"risk-score"`: evaluate `config.operator` (`gt`, `lt`, `between`) against `input.riskScore`
  - `"branch"`: `config.patterns` — any pattern matches `input.branch` (support `*` wildcards via simple glob)
  - `"license"`: `config.licenses` includes `input.license`
  - Unknown type: always returns `{ match: false, trace: [...] }`
- `ActionNode`: always returns `{ match: true, trace: [...] }` (actions are terminal — they don't filter)
- Every node appends a `TraceNode` to the trace array

`compile-yaml.ts`: Export `compileToYaml(tree: GroupNode): string`. Convert block tree to human-readable YAML. Use manual string building (no yaml library needed):
- GroupNodes become indented blocks with operator label
- ConditionNodes become `- <conditionType>: <config summary>`
- ActionNodes become `- action: <actionType> <config summary>`

Tests:
- `compile-predicates.test.ts`: Test each condition type, AND/OR/NOT short-circuit behavior, nested groups, trace correctness. Test the 4 approval strategy mappings from design doc section 7. Minimum 15 tests.
- `compile-yaml.test.ts`: Test simple tree, nested groups, each condition/action type. Verify output is valid indented text. Minimum 8 tests.

**Tests:** `cd packages/policy-engine && npx vitest run`

---

### Task 3: Policy engine — simulation and diff

**Files:**
- Create: `packages/policy-engine/src/simulate.ts`
- Create: `packages/policy-engine/src/diff.ts`
- Create: `packages/policy-engine/__tests__/simulate.test.ts`
- Create: `packages/policy-engine/__tests__/diff.test.ts`
- Modify: `packages/policy-engine/src/index.ts` (add exports from Tasks 2+3)

**Details:**

`simulate.ts`: Export `simulate(tree: GroupNode, input: PolicyInput): SimulationResult`. Wraps `compileToPredicates` + execution:
```typescript
interface SimulationResult {
  match: boolean;
  trace: TraceNode[];
  matchedActions: Array<{ nodeId: string; actionType: string; config: Record<string, unknown> }>;
  evaluationTimeMs: number;
}
```
Walk the trace to extract which ActionNodes were reached. Measure execution time with `performance.now()`.

`diff.ts`: Export `diffTrees(a: GroupNode, b: GroupNode): TreeDiff[]`. Structural diff:
```typescript
interface TreeDiff {
  type: "added" | "removed" | "modified" | "moved";
  nodeId: string;
  path: string[];  // path of parent IDs to this node
  details?: string;
}
```
Build flat maps of both trees by ID, compare: nodes in B not in A = added, in A not in B = removed, same ID but different content = modified. For moved: same ID, same content, different parent path.

Update `index.ts` to re-export `simulate`, `diff`, `compileToPredicates`, `compileToYaml`.

Tests:
- `simulate.test.ts`: Test full simulation of the 4 approval strategy trees from design doc. Verify `matchedActions` correctly identifies triggered actions. Test evaluationTimeMs is a positive number. Minimum 8 tests.
- `diff.test.ts`: Test added/removed/modified/moved detection. Test identical trees produce empty diff. Minimum 6 tests.

**Tests:** `cd packages/policy-engine && npx vitest run`

---

### Task 4: Database migration — add format and tree_rules columns

**Files:**
- Create: `packages/db/prisma/migrations/<timestamp>_add_policy_tree_format/migration.sql`
- Modify: `packages/db/prisma/schema.prisma` (update Policy model)

**Details:**

Update `Policy` model in schema.prisma (line 140):
```prisma
model Policy {
  id         String   @id @default(uuid()) @db.Uuid
  orgId      String   @map("org_id") @db.Uuid
  projectId  String?  @map("project_id") @db.Uuid
  name       String
  rules      Json
  treeRules  Json?    @map("tree_rules")
  format     String   @default("yaml")
  version    Int      @default(1)
  createdBy  String   @map("created_by")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  organization Organization    @relation(fields: [orgId], references: [id])
  versions     PolicyVersion[]

  @@index([orgId])
  @@map("policies")
}
```

Also update `PolicyVersion` to include `treeRules` and `format`:
```prisma
model PolicyVersion {
  id         String   @id @default(uuid()) @db.Uuid
  policyId   String   @map("policy_id") @db.Uuid
  version    Int
  name       String
  rules      Json
  treeRules  Json?    @map("tree_rules")
  format     String   @default("yaml")
  changedBy  String   @map("changed_by")
  changedAt  DateTime @default(now()) @map("changed_at")
  changeType String   @map("change_type")

  policy Policy @relation(fields: [policyId], references: [id])

  @@index([policyId, version])
  @@map("policy_versions")
}
```

Migration SQL:
```sql
ALTER TABLE policies ADD COLUMN format TEXT NOT NULL DEFAULT 'yaml';
ALTER TABLE policies ADD COLUMN tree_rules JSONB;
CREATE INDEX idx_policies_format ON policies(org_id, format);

ALTER TABLE policy_versions ADD COLUMN format TEXT NOT NULL DEFAULT 'yaml';
ALTER TABLE policy_versions ADD COLUMN tree_rules JSONB;
```

Run `npx prisma generate` after migration to update the client.

**Tests:** Run `npx prisma migrate dev --name add_policy_tree_format` then verify `npx prisma generate` succeeds.

---

### Task 5: API — update policy routes for tree format + simulation endpoint

**Files:**
- Create: `apps/api/src/services/policy-service.ts`
- Modify: API policy route files (find via existing route registration in `openapi.ts` line 18-19)
- Create: `apps/api/src/__tests__/policy-tree.test.ts`

**Details:**

`policy-service.ts`: Import `@sentinel/policy-engine`. Export:
- `validateAndCompileTree(tree: GroupNode): { valid: boolean; issues: ValidationIssue[]; yaml?: string }` — runs `validateTree`, if valid also runs `compileToYaml`
- `simulatePolicy(tree: GroupNode, input: PolicyInput): SimulationResult` — wraps `simulate`

Update policy routes to handle `format` field:
- `POST /v1/policies`: Accept `{ name, rules, format?, treeRules? }`. If `format === "tree"`, validate `treeRules` with `validateAndCompileTree`, store in `treeRules` column. If `format === "yaml"` (default), existing behavior.
- `PUT /v1/policies/:id`: Same dual-format support.
- `GET /v1/policies/:id`: Return both `rules` and `treeRules` and `format` fields.

Add new endpoints:
- `POST /v1/policies/simulate`: Body `{ tree: GroupNode, input: PolicyInput }`. Returns `SimulationResult`. Requires auth.
- `POST /v1/policies/compile-yaml`: Body `{ tree: GroupNode }`. Returns `{ yaml: string, valid: boolean, issues: ValidationIssue[] }`. Requires auth.

Register new routes in the OpenAPI spec array (openapi.ts line 18).

`policy-tree.test.ts`: Test:
1. Create policy with `format: "tree"` — succeeds with valid tree
2. Create policy with `format: "tree"` — fails with invalid tree (missing actions)
3. Simulate endpoint returns correct trace
4. Compile-yaml endpoint returns valid YAML
5. Existing YAML format still works (backward compat)
Minimum 8 tests.

**Tests:** `cd apps/api && npx vitest run`

---

### Task 6: Dashboard — tree context, reducer, and undo/redo

**Files:**
- Create: `apps/dashboard/components/policy-builder/index.ts`
- Create: `apps/dashboard/components/policy-builder/contexts/tree-context.tsx`
- Create: `apps/dashboard/components/policy-builder/__tests__/tree-reducer.test.ts`

**Details:**

`tree-context.tsx`: Implements the tree state management using React `useReducer` + Context.

TreeAction union type (from design doc section 6):
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

State shape:
```typescript
interface TreeState {
  tree: GroupNode;
  history: GroupNode[];  // undo stack, max 50
  future: GroupNode[];   // redo stack
}
```

Reducer logic:
- `ADD_NODE`: Find parent by ID (recursive search), splice child at position. Push previous tree to history, clear future.
- `MOVE_NODE`: Remove node from current parent, add to new parent at position. Push to history.
- `DELETE_NODE`: Remove node and all children. Push to history.
- `UPDATE_NODE`: Merge patch into target node. Push to history.
- `SET_OPERATOR`: Update operator on GroupNode. Push to history.
- `UNDO`: Pop from history, push current to future.
- `REDO`: Pop from future, push current to history.

Context exports:
- `TreeProvider` component with `initialTree` prop
- `useTree()` hook returning `{ tree, dispatch, canUndo, canRedo, index }` where `index` is the derived `Map<string, RuleNode>` (via `useMemo`)
- `buildIndex(tree: GroupNode): Map<string, RuleNode>` helper

`tree-reducer.test.ts`: Test each action type, undo/redo stack behavior, history cap at 50. Test `buildIndex` produces correct flat map. Minimum 12 tests. Use `@testing-library/react` `renderHook` for context testing.

**Tests:** `cd apps/dashboard && npx vitest run`

---

### Task 7: Dashboard — block registry and built-in block plugins

**Files:**
- Create: `apps/dashboard/components/policy-builder/blocks/types.ts`
- Create: `apps/dashboard/components/policy-builder/blocks/registry.ts`
- Create: `apps/dashboard/components/policy-builder/blocks/severity-condition.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/category-condition.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/risk-score-condition.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/branch-condition.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/license-condition.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/and-group.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/or-group.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/not-group.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/block-action.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/review-action.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/notify-action.tsx`
- Create: `apps/dashboard/components/policy-builder/blocks/allow-action.tsx`

**Details:**

`types.ts`: Define `BlockPlugin<C>` interface from design doc section 6:
```typescript
interface BlockPlugin<C = unknown> {
  type: string;
  category: "condition" | "group" | "action";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultConfig: C;
  schema: ZodType<C>;
  Renderer: React.ComponentType<{ node: RuleNode; config: C }>;
  PropertyEditor: React.ComponentType<{ config: C; onChange: (c: C) => void }>;
}
```

`registry.ts`: `BlockRegistry` class with `register(plugin)`, `get(type)`, `getAll()`, `getByCategory(category)`. Export `defaultRegistry` with all 12 built-in plugins registered.

Each block plugin file exports a `BlockPlugin` object:
- **Conditions**: Each has a `Renderer` (compact card showing condition summary), `PropertyEditor` (form fields for config), `schema` (zod validation), `defaultConfig`. Use existing dashboard design tokens (Tailwind classes from `policy-validator.tsx`).
  - `severity-condition`: Multi-select chips for severity levels
  - `category-condition`: Multi-select chips for categories
  - `risk-score-condition`: Operator dropdown + number input(s)
  - `branch-condition`: Tag input for branch patterns
  - `license-condition`: Tag input for license identifiers

- **Groups**: `and-group`, `or-group`, `not-group`. Renderers show operator label + children container. Property editors are minimal (just operator display). Groups use distinct border colors: AND=accent, OR=amber, NOT=red.

- **Actions**: `block-action` (reason text input), `review-action` (role dropdown, SLA hours number, escalation config), `notify-action` (channel select + recipients tag input), `allow-action` (no config, just label).

Styling: Match existing dashboard design language — `bg-surface-0`, `bg-surface-1`, `border-border`, `text-text-primary`, `text-text-secondary`, `text-text-tertiary`, `bg-accent`, `text-accent`, rounded-xl borders, `text-[13px]` body text, `text-[11px]` labels.

**Tests:** No separate test file for this task — block plugins are UI components tested via integration tests in Task 10.

---

### Task 8: Dashboard — drag-and-drop context and Canvas component

**Files:**
- Create: `apps/dashboard/components/policy-builder/contexts/drag-context.tsx`
- Create: `apps/dashboard/components/policy-builder/contexts/selection-context.tsx`
- Create: `apps/dashboard/components/policy-builder/components/Canvas.tsx`
- Create: `apps/dashboard/components/policy-builder/components/BlockCard.tsx`
- Create: `apps/dashboard/components/policy-builder/components/DropZone.tsx`
- Create: `apps/dashboard/components/policy-builder/components/Palette.tsx`
- Modify: `apps/dashboard/package.json` (add @dnd-kit dependencies)

**Details:**

Add to `apps/dashboard/package.json` dependencies:
```json
"@dnd-kit/core": "^6.1.0",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2",
"zod": "^3.23.0",
"@sentinel/policy-engine": "workspace:*"
```

`drag-context.tsx`: Wraps `@dnd-kit/core` `DndContext`. Handles `onDragStart`, `onDragOver`, `onDragEnd`. On drag end: if source is palette, dispatch `ADD_NODE` with `defaultConfig` from registry. If source is canvas, dispatch `MOVE_NODE`. Use `DragOverlay` for visual feedback during drag. Export `DragProvider` and `useDrag()`.

`selection-context.tsx`: Track `selectedNodeId: string | null`. Keyboard navigation: Arrow keys move selection through tree (up/down = siblings, left = parent, right = first child). Export `SelectionProvider` and `useSelection()`.

`Canvas.tsx`: Recursive renderer. For each node in `tree.children`:
- If `GroupNode`: render group container (colored border per operator) with nested `Canvas` for children + `DropZone` at each position
- If `ConditionNode` / `ActionNode`: render `BlockCard`
- Drop zones between each child + at end of group

`BlockCard.tsx`: Renders a single block. Looks up `BlockPlugin` from registry by `node.type` (for conditions: `condition:${conditionType}`, for actions: `action:${actionType}`, for groups: `group:${operator.toLowerCase()}`). Delegates to plugin's `Renderer`. Shows selection highlight when selected. Draggable via `useSortable`.

`DropZone.tsx`: Visual drop indicator. Shows a thin accent line when a draggable hovers over it. Uses `useDroppable` from `@dnd-kit`.

`Palette.tsx`: Left sidebar. Lists all block types from `defaultRegistry` grouped by category (Conditions, Groups, Actions). Each is a draggable card with the plugin's `icon` and `label`. Use `useDraggable` from `@dnd-kit`.

**Tests:** Defer to Task 10 (integration) and Task 12 (e2e).

---

### Task 9: Dashboard — property panel, validation panel, and compound root

**Files:**
- Create: `apps/dashboard/components/policy-builder/contexts/validation-context.tsx`
- Create: `apps/dashboard/components/policy-builder/components/PropertyPanel.tsx`
- Create: `apps/dashboard/components/policy-builder/components/ValidationPanel.tsx`
- Create: `apps/dashboard/components/policy-builder/components/ModeToggle.tsx`
- Create: `apps/dashboard/components/policy-builder/components/YamlPreview.tsx`
- Create: `apps/dashboard/components/policy-builder/components/SimulationPanel.tsx`
- Create: `apps/dashboard/components/policy-builder/PolicyBuilder.tsx`
- Modify: `apps/dashboard/components/policy-builder/index.ts` (export PolicyBuilder)

**Details:**

`validation-context.tsx`: Runs `validateTree` (from `@sentinel/policy-engine`) on every tree change via `useMemo`. Exposes `{ issues, hasErrors, errorCount, warningCount }`. Export `ValidationProvider` and `useValidation()`.

`PropertyPanel.tsx`: When a node is selected (via `useSelection`), look up its `BlockPlugin` from the registry and render the plugin's `PropertyEditor`. On config change, dispatch `UPDATE_NODE`. When nothing selected, show a placeholder message.

`ValidationPanel.tsx`: Display validation issues from `useValidation()`. Reuse the visual style from `policy-validator.tsx` (error/warning/info cards with colored borders). Clicking an issue selects the referenced node.

`ModeToggle.tsx`: Simple toggle switch — "Simple" / "Advanced". Stores mode in local state. Passed down via PolicyBuilder context.

`YamlPreview.tsx` (advanced mode only): Read-only `<pre>` block showing output of `compileToYaml(tree)` via `useMemo`. Styled like the existing `PolicyEditor` textarea but non-editable with syntax-highlighted-like monospace display.

`SimulationPanel.tsx` (advanced mode only): Textarea for sample JSON input + "Run Simulation" button. Calls `simulate(tree, parsedInput)` from `@sentinel/policy-engine`. Displays result: match/no-match badge, trace list showing which nodes matched/didn't, matched actions list. On simulation run, pass trace to Canvas context so blocks can highlight green (matched) or red (not matched).

`PolicyBuilder.tsx`: Compound component root. Composes all providers and sub-components:
```tsx
<PolicyBuilder.Provider tree={tree} onChange={onTreeChange} registry={defaultRegistry}>
  <PolicyBuilder.DragProvider>
    <PolicyBuilder.SelectionProvider>
      <PolicyBuilder.ValidationProvider>
        {/* Layout: 3-column on large screens */}
        <Palette />
        <Canvas />
        <div>
          <PropertyPanel />
          <ValidationPanel />
          {advancedMode && <YamlPreview />}
          {advancedMode && <SimulationPanel />}
        </div>
        <ModeToggle />
      </PolicyBuilder.ValidationProvider>
    </PolicyBuilder.SelectionProvider>
  </PolicyBuilder.DragProvider>
</PolicyBuilder.Provider>
```

Props: `{ initialTree?: GroupNode; onChange?: (tree: GroupNode) => void; mode?: "simple" | "advanced" }`.

`index.ts`: Export `PolicyBuilder` as default and named export. Export `defaultRegistry`. Export types.

**Tests:** Defer to Task 10 (integration) and Task 12 (e2e).

---

### Task 10: Dashboard — integration tests for PolicyBuilder

**Files:**
- Create: `apps/dashboard/components/policy-builder/__tests__/policy-builder.test.tsx`

**Details:**

Install test dependencies if not present: `@testing-library/react`, `@testing-library/user-event`.

Integration tests using Testing Library:
1. **Renders empty builder**: Mount `PolicyBuilder` with default empty tree (root AND group). Verify palette, canvas, property panel, validation panel all render.
2. **Block selection**: Click a block on canvas → property panel shows its editor. Click empty area → property panel shows placeholder.
3. **Validation display**: Mount with invalid tree (AND group with no children and no action) → validation panel shows errors.
4. **Mode toggle**: Default is simple mode (no YAML preview). Toggle to advanced → YAML preview appears.
5. **Property editing**: Select a severity condition block → change severities → verify tree state updates.
6. **Undo/redo**: Add a block, undo → block removed. Redo → block restored.
7. **YAML preview (advanced)**: Mount with a simple tree, toggle to advanced → YAML preview shows expected output.

Use mock `DndContext` if needed to avoid actual drag-drop in unit tests (drag-drop tested in e2e).

Minimum 7 tests.

**Tests:** `cd apps/dashboard && npx vitest run`

---

### Task 11: Dashboard — integrate PolicyBuilder into policy pages

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/policies/new/page.tsx`
- Modify: `apps/dashboard/app/(dashboard)/policies/[id]/page.tsx`
- Modify: `apps/dashboard/app/(dashboard)/policies/[id]/actions.ts`
- Modify: `apps/dashboard/app/(dashboard)/policies/page.tsx`

**Details:**

`new/page.tsx`: Add a "Visual" / "YAML" tab toggle at the top. Default to "Visual" tab.
- "Visual" tab: Render `<PolicyBuilder onChange={handleTreeChange} />`. Save button sends `{ name, treeRules: tree, format: "tree" }` via `createPolicy`.
- "YAML" tab: Existing `PolicyEditor` + `PolicyValidator` (unchanged).
- Share the policy name input and save button between tabs.

`[id]/page.tsx`: Detect `policy.format` from API response.
- If `format === "tree"`: render `<PolicyBuilder initialTree={policy.treeRules} onChange={...} />`
- If `format === "yaml"`: render existing `PolicyEditor` with existing YAML
- Add "Convert to Visual" button for YAML policies (future — just show disabled button with tooltip "Coming in Phase 2")

`[id]/actions.ts`: Update `updatePolicy` to accept `{ name, rules?, treeRules?, format }`. Update `createPolicy` similarly. Both pass through to the API.

`page.tsx` (policies list): Add a "Format" badge column showing "Visual" or "YAML" for each policy.

**Tests:** Manual verification — covered by e2e tests in Task 12.

---

### Task 12: End-to-end tests for the visual policy builder

**Files:**
- Create: `apps/dashboard/__tests__/e2e/policy-builder.spec.ts`

**Details:**

Playwright e2e tests (follow existing e2e test patterns in the project):

1. **Create policy via visual builder**: Navigate to `/policies/new` → click "Visual" tab → drag severity condition from palette to canvas → configure it → drag block action → save → verify redirect to policy detail page → verify policy shows in list with "Visual" format badge.

2. **Edit existing visual policy**: Navigate to visual policy detail → add an OR group → move a condition into it → save → reload → verify tree structure persists.

3. **Undo/redo**: Create a tree → undo → verify block removed → redo → verify block restored.

4. **Advanced mode**: Toggle to advanced → verify YAML preview panel appears → verify simulation panel appears → paste sample JSON → run simulation → verify trace highlights.

5. **Validation prevents save**: Create tree with only a condition (no action) → verify save button is disabled → verify validation panel shows error.

6. **YAML mode backward compat**: Navigate to `/policies/new` → click "YAML" tab → enter valid YAML → save → verify policy created with "YAML" format badge.

Minimum 6 e2e tests.

**Tests:** `cd apps/dashboard && npx playwright test __tests__/e2e/policy-builder.spec.ts`

---

### Dependencies Between Tasks

```
Task 1 (types + validate) ──┐
                             ├── Task 2 (compile) ──┐
                             │                       ├── Task 3 (simulate + diff)
                             │                       │
Task 4 (DB migration) ──────┤                       │
                             ├── Task 5 (API routes) ┘
                             │
Task 6 (tree context) ──────┤
                             ├── Task 7 (block registry) ──┐
                             │                              ├── Task 8 (drag + canvas) ──┐
                             │                              │                            ├── Task 9 (panels + root)
                             │                              │                            │         │
                             │                              │                            │         ├── Task 10 (integration tests)
                             │                              │                            │         │
                             └──────────────────────────────┘                            │         ├── Task 11 (page integration)
                                                                                         │         │         │
                                                                                         └─────────┴─────────┴── Task 12 (e2e tests)
```

**Parallelizable groups:**
- Tasks 1 + 4 + 6 (no dependencies between them)
- Tasks 2 + 7 (after their respective prerequisites)
- Tasks 5 + 8 (after their respective prerequisites)
- Tasks 3 + 9 (after their respective prerequisites)
- Tasks 10 + 11 (after Task 9)
- Task 12 (after Tasks 10 + 11)
