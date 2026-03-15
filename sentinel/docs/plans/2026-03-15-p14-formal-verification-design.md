# P14: Formal Verification Integration — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the corresponding plan task-by-task.

**Goal:** Add a formal verification agent to Sentinel that validates code properties (preconditions, postconditions, invariants) using abstract interpretation + Z3 SMT solving, producing findings that flow through the existing pipeline.

**Architecture:** Language-agnostic verification engine with pluggable language frontends (Python first). Two-stage verification: lightweight abstract interpretation resolves trivially-satisfied properties, undecided properties escalate to Z3 SMT solver. Properties are hybrid — automatically inferred from code patterns + explicit developer annotations. Verification scope is diff + call-graph neighbors (direct callers/callees of changed functions).

**Tech Stack:** Python 3.12, z3-solver, tree-sitter, sentinel-agent-framework, asyncio + ProcessPoolExecutor

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language scope | Language-agnostic core, Python first frontend | Diffs don't provide full repos; property-checking on VCs works on hunks; tiered analysis pattern |
| Verification scope | Diff + call-graph neighbors | Pure diff misses contract violations at boundaries; full-module too slow for CI |
| Property specification | Hybrid: inferred defaults + explicit annotations | Zero annotations = zero findings is a non-starter; inference gives day-one value |
| Engine strategy | Z3 core + abstract interpretation pre-pass | AI resolves 70% cheaply; Z3 handles the hard 30% precisely |

---

## I. Enterprise Design Analysis — Algorithms

### Approach A: Pure Abstract Interpretation (Widening/Narrowing Lattice)

Classic Cousot & Cousot. Build lattice of abstract values (intervals, null/non-null, type states), propagate forward through CFG using widening for termination, narrow for precision.

- **Performance:** O(n x h) where n = CFG nodes, h = lattice height. Sub-100ms for function-sized code.
- **Accuracy:** Sound (no false negatives for the abstract domain) but imprecise — over-approximation causes false positives on complex paths.
- **Scalability:** Excellent. Linear in program size. Used by Facebook Infer at Meta scale.
- **Limitation:** Cannot prove path-sensitive properties. Loops with conditionals lose precision after widening.

### Approach B: Pure SMT Constraint Solving (Bounded Model Checking)

Encode program as SMT formulas (SSA form -> bitvector/integer constraints), assert negation of property, ask Z3 for counterexample. UNSAT = property holds.

- **Performance:** Exponential worst case. Typically 100ms-30s per property.
- **Accuracy:** Complete for bounded paths. Counterexamples are concrete and actionable.
- **Scalability:** Poor for large functions. Path explosion on loops/recursion.
- **Limitation:** Timeout-prone. Cannot handle unbounded loops without invariant hints.

### Approach C: Hybrid — Abstract Interpretation Pre-Pass + SMT Escalation (SELECTED)

Two-stage pipeline. Stage 1: Abstract interpretation classifies each property as HOLDS, VIOLATED, or UNDECIDED. Stage 2: Only UNDECIDED properties go to Z3. Stage 3: Z3 produces concrete counterexamples or proofs.

- **Performance:** 70% resolved in Stage 1 (< 50ms). Only 30% escalate to Z3. Amortized: 200-500ms per function.
- **Accuracy:** Combines soundness of AI with completeness of SMT.
- **Scalability:** AI scales linearly; Z3 load bounded by escalation rate. Per-property timeout (5s) prevents runaway.
- **Efficiency:** Z3 queries benefit from AI-derived bounds as seed constraints.

**Why Hybrid:** Strictly better than either alone. AI eliminates easy cases cheaply, Z3 handles hard cases precisely. Neither alone achieves both speed and precision.

| Metric | Pure AI | Pure SMT | Hybrid |
|--------|---------|----------|--------|
| Latency (p99) | 50ms | 30s | 800ms |
| False positive rate | 15-25% | 0% | 2-5% |
| False negative rate | 0% (sound) | 0% (bounded) | 0% |
| Scalability | Excellent | Poor | Good |
| Counterexample quality | None | Concrete | Concrete |

---

## II. Enterprise Design Analysis — Data Structures

### Approach A: Flat Property List with Linear Scan

Store properties as `list[Property]`. Scan full list for matching properties per function.

- **Performance:** O(p x f) where p = properties, f = functions. Fine for < 1000 properties.
- **Scalability:** Degrades linearly. 10K properties x 50 functions = 500K comparisons.

### Approach B: Trie-Based Hierarchical Property Index

Properties indexed by file path trie. Lookup traverses `src -> auth -> login.py -> validate` collecting properties at each level.

- **Performance:** O(d) where d = path depth (4-6). Sub-microsecond lookup.
- **Scalability:** Excellent. Shared prefixes amortize trie size.
- **Limitation:** Overkill for < 100 annotated files.

### Approach C: Scope-Layered HashMap (SELECTED)

Three-layer HashMap: `global_properties`, `file_properties[path]`, `function_properties[path:func]`. Resolution walks layers bottom-up (function -> file -> global) with precedence.

- **Performance:** O(1) per layer, O(3) layers = constant time.
- **Scalability:** HashMap O(1) for 99% of repos. Trie fallback at 5K+ annotated files.
- **Efficiency:** Most-specific property found first — early exit on explicit annotations.

**Why NOT Hybrid:** This is not a true hybrid — it's a scope-chain HashMap. No workload requires both constant-time lookup AND prefix traversal in the same query. Since the verification pipeline always queries by specific function, HashMap dominates. The trie fallback is a scalability escape hatch, not a fundamental algorithm change.

---

## III. Enterprise Design Analysis — System Design

### Approach A: Monolithic Agent (Single Process)

One Python process: parse -> extract -> verify -> emit. All in `process(DiffEvent)`.

- **Performance:** Sequential. Z3 blocks event loop.
- **Scalability:** Vertical only. Redis consumer group handles horizontal.
- **Advantage:** Zero operational overhead. Same deployment as all other agents.

### Approach B: Microservice Decomposition (Separate Solver Service)

Agent process + separate Z3 worker pool connected via `sentinel.verify` queue.

- **Performance:** Solver pool parallelizes Z3 queries.
- **Scalability:** Independent solver scaling.
- **Disadvantage:** Two services to deploy/monitor. Network latency. Operational complexity.

### Approach C: Tiered Single-Agent with Async Z3 Subprocess Pool (SELECTED)

Single agent process following BaseAgent pattern. AI runs in-process. Z3 dispatched to ProcessPoolExecutor subprocesses. Per-property timeout.

- **Performance:** AI < 50ms in-process. Z3 parallelized across cores. Total: 500ms-3s.
- **Scalability:** Pool size configurable. Redis consumer group for horizontal scaling.
- **Reliability:** Per-property timeout. Agent always completes.
- **Operational simplicity:** Single Dockerfile, same monitoring as all agents.

**Why NOT Hybrid (microservice):** Microservice decomposition justified only if solver needs GPU, independent scaling beyond agent pool, or persistent state across scans. None apply. Diffs are small, properties independent, Z3 queries stateless.

---

## IV. Enterprise Design Analysis — Software Design

### Approach A: Procedural Pipeline

Single `process()` calling sequential functions. No abstraction beyond functions.

- Hard to test stages in isolation. No extension points for new languages.

### Approach B: Full Strategy/Plugin Architecture (Pearl-Style)

Every stage is an interface. DI wires implementations together.

- Over-engineered for one language frontend at launch. 6 interfaces for 1 implementation each.

### Approach C: Thin Pipeline Spine + Pluggable Language Frontends (SELECTED)

Concrete pipeline spine. Single extension point: `LanguageFrontend` protocol. Verification engine shared and language-agnostic — operates on VCs, not language ASTs.

- **Maintainability:** Concrete pipeline is readable. One abstraction to understand.
- **Extensibility:** Adding C = implementing `CFrontend(LanguageFrontend)`. Engine reused unchanged.
- **Testability:** Frontend testable independently. Engine testable with synthetic VCs.
- **YAGNI:** Abstraction only where variation exists (languages). Concrete everywhere else.

**Why Hybrid wins:** Genuine hybrid of A's simplicity and B's extensibility. Variation lives only in language frontends (will have multiple implementations). Verification engine, reporter, agent spine have exactly one implementation each — abstracting them adds indirection without value.

---

## V. Component Architecture

```
FormalVerificationAgent (BaseAgent subclass)
|-- process(DiffEvent) -> list[Finding]
|
|-- LanguageFrontend (Protocol)
|   |-- PythonFrontend
|   |   |-- parse_ast(source) -> AST
|   |   |-- extract_properties(ast, annotations, config) -> list[Property]
|   |   |-- build_call_graph(ast) -> CallGraph
|   |   +-- generate_vcs(properties, call_graph) -> list[VerificationCondition]
|   +-- [future: CFrontend, TypeScriptFrontend]
|
|-- PropertyInferer (shared, language-agnostic on VCs)
|   |-- infer_null_checks(vc) -> list[Property]
|   |-- infer_bounds(vc) -> list[Property]
|   |-- infer_type_state(vc) -> list[Property]
|   +-- infer_return_contracts(vc) -> list[Property]
|
|-- VerificationEngine (shared, two-stage)
|   |-- AbstractInterpreter
|   |   |-- IntervalDomain (integer ranges)
|   |   |-- NullnessDomain (null / non-null / maybe-null)
|   |   +-- TypeStateDomain (open/closed, init/used)
|   +-- SMTBridge
|       |-- vc_to_smt(vc) -> z3.ExprRef
|       |-- solve(expr, timeout_ms) -> SolverResult
|       +-- extract_counterexample(model) -> Counterexample
|
|-- SourceFetcher (retrieves full source for call-graph neighbors)
|   +-- fetch_file(project_id, commit, path) -> str | None
|
+-- FindingBuilder
    +-- build_finding(property, result, counterexample?) -> Finding
```

---

## VI. Core Data Types

```python
@dataclass
class Property:
    kind: str          # "precondition" | "postcondition" | "invariant" | "assertion"
    source: str        # "inferred" | "annotated"
    expression: str    # Human-readable: "x is not None", "return >= 0"
    location: Location # file, line_start, line_end, function_name
    confidence: str    # annotated="high", inferred="medium"

@dataclass
class VerificationCondition:
    property: Property
    context: VCContext       # SSA variables, path constraints, loop bounds
    assumptions: list[Expr]  # Preconditions assumed true
    goal: Expr               # Property to prove (abstract syntax)

@dataclass
class VerificationResult:
    status: str        # "verified" | "violated" | "undecided" | "timeout"
    stage: str         # "abstract_interp" | "smt"
    counterexample: Counterexample | None
    duration_ms: int

@dataclass
class Counterexample:
    variable_assignments: dict[str, str]  # {"x": "None", "n": "-1"}
    execution_path: list[str]             # ["line 12: if branch taken", ...]
```

---

## VII. Pipeline Execution Flow

```
DiffEvent arrives
  |
  v
1. PARSE -- LanguageFrontend.parse_ast() for each changed file
  |         Also fetch call-graph neighbor source via SourceFetcher
  v
2. EXTRACT -- For each changed function:
  |   a. LanguageFrontend.extract_properties() -- explicit annotations
  |   b. PropertyInferer.infer_*() -- automatic inference
  |   c. Merge: explicit annotations override inferred (by location)
  |   d. Also extract properties for direct callers/callees
  v
3. GENERATE VCs -- LanguageFrontend.generate_vcs()
  |   SSA transformation, path encoding, loop bound annotation
  v
4. VERIFY Stage 1 -- AbstractInterpreter
  |   For each VC: propagate through abstract domains
  |   VERIFIED -> skip Z3  |  VIOLATED -> emit finding  |  UNDECIDED -> escalate
  v
5. VERIFY Stage 2 -- SMTBridge (only undecided VCs)
  |   vc_to_smt() -> Z3 solve with timeout
  |   UNSAT -> verified  |  SAT -> counterexample  |  TIMEOUT -> inconclusive
  |   Runs in ProcessPoolExecutor (parallel, default pool = CPU count)
  v
6. REPORT -- FindingBuilder
  |   Each violated/inconclusive property -> Finding
  v
7. Return list[Finding] -> sentinel.findings
```

---

## VIII. Python Frontend

### Annotation Syntax

```python
# Decorator style (preferred)
from sentinel_verify import precondition, postcondition, invariant

@precondition(lambda x: x is not None)
@postcondition(lambda result: result >= 0)
def calculate_score(x: int) -> int:
    return abs(x)

# Docstring style (zero-dependency)
def calculate_score(x: int) -> int:
    """Calculate score.
    :requires: x is not None
    :ensures: return >= 0
    """
    return abs(x)

# Class invariant
@invariant(lambda self: self.balance >= 0)
class BankAccount:
    ...
```

### Inferred Properties

| Pattern Detected | Property Inferred | Category |
|---|---|---|
| `if x is None: raise` at function start | `precondition: x is not None` | null-deref |
| `assert 0 <= x <= 100` | `precondition: 0 <= x <= 100` | bounds-overflow |
| `isinstance(x, str)` guard | `precondition: type(x) is str` | type-state |
| `return` always inside `try` | `postcondition: no uncaught exception` | exception-safety |
| Type hint `-> int` (no None) | `postcondition: result is not None` | null-return |
| `file.close()` in `finally` | `invariant: resource released` | resource-leak |
| Division by variable | `precondition: divisor != 0` | division-by-zero |

### Call-Graph Construction

AST-based `dict[str, set[str]]` mapping functions to callees. For diff scope: identify changed functions, find direct callers/callees within same module. Cross-module calls tracked but not resolved in V1.

### VC Generation

1. SSA-transform function body (`x_0`, `x_1`, ...)
2. Encode control flow as path constraints
3. Loop unrolling up to `LOOP_BOUND` (default 8)
4. Goal: property as assertion at appropriate program point
5. Output: `VerificationCondition(assumptions=[path_constraints], goal=property_expr)`

---

## IX. Abstract Interpretation Domains

Three domains composed as a **reduced product**:

### IntervalDomain

Tracks integer ranges `[lo, hi]`. Join: `[min(lo1,lo2), max(hi1,hi2)]`. Widening: bound goes to infinity if increasing. Narrowing: intersect with conditional constraints. Proves: bounds checks, division-by-zero, array index bounds.

### NullnessDomain

Tracks `NonNull | Null | MaybeNull` per variable. Assignment to literal -> `NonNull`. `None` literal -> `Null`. Function call return -> `MaybeNull`. Conditional `if x is not None` refines branches. Proves: null-dereference, non-null returns.

### TypeStateDomain

Tracks resource lifecycle `{Uninit, Open, Closed, Error}`. `open()` -> `Open`. `close()` -> `Closed`. Use after `Closed` -> violation. Proves: resource leaks, use-after-close, double-close.

### Reduced Product

After independent computation, cross-domain refinement. Example: NullnessDomain proves `x = NonNull` -> IntervalDomain excludes null representation. Eliminates false positives from domain-independent analysis.

---

## X. SMT Bridge

Z3 queries dispatched to `ProcessPoolExecutor` subprocesses:

- `ProcessPoolExecutor` not `ThreadPoolExecutor` — Z3 is CPU-bound, subprocess isolation prevents memory leaks
- Per-VC timeout (default 5s) prevents single hard property from blocking scan
- Batch verification: all undecided VCs submitted in parallel via `asyncio.gather`
- Counterexample extraction: Z3 model -> variable assignments + execution path

---

## XI. Finding Integration

No new FindingType needed. Formal verification findings map to existing types via `category` field:

| Verification Category | Finding Type | Category String | Severity |
|---|---|---|---|
| Null dereference | security | formal-verification/null-deref | critical (auth/crypto) / high |
| Bounds overflow | security | formal-verification/bounds-overflow | high |
| Division by zero | security | formal-verification/division-by-zero | high |
| Resource leak | quality | formal-verification/resource-leak | medium |
| Contract violation | quality | formal-verification/contract-violation | varies |
| Type state error | quality | formal-verification/type-state | medium |
| Assertion failure | security | formal-verification/assertion-failure | high |

Compliance framework match rules reference via `{ agent: "formal-verification" }` and `{ category: "formal-verification/*" }`.

---

## XII. Configuration

```yaml
# .sentinel-verify.yml (per-repository)
formal_verification:
  enabled: true
  languages:
    python:
      enabled: true
      annotation_style: "decorator"    # "decorator" | "docstring" | "both"
      infer_properties: true
  engine:
    loop_bound: 8
    smt_timeout_ms: 5000
    pool_size: 4
    max_properties_per_function: 20
  scope:
    call_graph_depth: 1
    skip_test_files: true
    skip_patterns:
      - "**/migrations/**"
      - "**/generated/**"
  invariants:
    - pattern: "def handle_*"
      requires: "request is not None"
    - pattern: "def api_*"
      ensures: "return is not None"
```

---

## XIII. Error Handling

| Failure Mode | Handling | User Impact |
|---|---|---|
| Z3 timeout on property | `status="timeout"` -> Finding `confidence: "low"` | Informational, no CI block |
| Z3 subprocess crash | ProcessPoolExecutor auto-restarts worker | Transparent |
| AST parse failure | Skip file, log warning | Partial results |
| SourceFetcher fails | Fall back to diff-only for that function | Reduced scope |
| Invalid annotation | Finding `category: "formal-verification/invalid-annotation"` | Developer feedback |
| Config missing | All defaults apply, inference enabled | Zero-config works |

---

## XIV. Testing Strategy

| Layer | Tests | Count |
|---|---|---|
| Property inference | Each pattern with positive/negative cases | 25-30 |
| Abstract interpretation | Each domain: lattice ops, widening, narrowing | 20-25 |
| SMT bridge | VC->Z3, solve, counterexample, timeout | 15-20 |
| Python frontend | AST, annotations, call-graph, VC gen | 20-25 |
| Agent integration | Full process(DiffEvent), finding format | 10-15 |
| Configuration | YAML parsing, defaults, overrides | 5-8 |
| **Total** | | **~100-120** |
