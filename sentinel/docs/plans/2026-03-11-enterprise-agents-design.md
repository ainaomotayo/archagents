# Enterprise Agent Upgrades — Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade all 6 agents + framework to enterprise production grade with provider-agnostic LLM, two-pass correlation, real-time streaming, tree-sitter AST analysis, and adaptive confidence calibration.

**Architecture:** Microkernel — new `agents/core/` Python package provides shared enterprise capabilities (LLM abstraction, AST analysis, PII scrubbing, correlation, streaming). Each agent imports only what it needs. Framework orchestrates two-pass execution.

**Tech Stack:** Python 3.12, tree-sitter (WASM), LiteLLM, Redis Streams, SSE, asyncio

**Decisions Record:**
- Full Enterprise + Novel Capabilities (Option 3)
- All tiers in parallel (Framework + all agents simultaneously)
- Provider-agnostic LLM abstraction (per-org configuration)
- Two-pass correlation architecture (independent → enrich → optional LLM escalation)
- Layered PII scrubbing (framework mandatory base + agent-specific patterns)
- SSE for reads + REST for commands

---

## 1. Architecture Overview

Microkernel approach — new `agents/core/` Python package providing shared enterprise capabilities. Each agent imports only what it needs. Framework orchestrates two-pass correlation.

```
agents/
├── core/                          # NEW: shared enterprise capabilities
│   ├── agent_core/
│   │   ├── llm/                   # Provider-agnostic LLM abstraction
│   │   │   ├── provider.py        # Base interface + registry
│   │   │   ├── anthropic.py       # Claude adapter
│   │   │   ├── openai.py          # GPT adapter
│   │   │   ├── litellm.py         # 100+ providers via LiteLLM
│   │   │   ├── local.py           # Ollama/vLLM adapter
│   │   │   └── budget.py          # Token budget manager
│   │   ├── analysis/              # Shared analysis tools
│   │   │   ├── treesitter.py      # Tree-sitter AST (WASM)
│   │   │   ├── complexity.py      # Language-agnostic cyclomatic complexity
│   │   │   ├── fingerprint.py     # Enhanced code fingerprinting
│   │   │   └── search.py          # Multi-index (BM25 + semantic + RRF)
│   │   ├── scrubbing/             # Layered PII scrubbing
│   │   │   ├── base.py            # Framework-level mandatory scrubber
│   │   │   └── registry.py        # Agent-specific pattern registration
│   │   ├── streaming/             # Real-time event delivery
│   │   │   ├── sse.py             # SSE publisher
│   │   │   └── signals.py         # Inter-agent signal types
│   │   ├── correlation/           # Two-pass correlation
│   │   │   ├── engine.py          # Correlation rules + enrichment
│   │   │   └── confidence.py      # Adaptive confidence calibration
│   │   └── cache.py               # Shared Redis caching
│   └── pyproject.toml
├── framework/                     # ENHANCED: orchestration upgrades
│   └── sentinel_agents/
│       ├── runner.py              # Enhanced: two-pass + SSE + retry
│       ├── orchestrator.py        # NEW: multi-agent coordinator
│       └── ...existing...
├── quality/                       # UPGRADED: tree-sitter AST
├── ai-detector/                   # UPGRADED: ensemble calibration
├── ip-license/                    # UPGRADED: fingerprint DB + SPDX parser
├── policy/                        # UPGRADED: hierarchical merging
├── llm-review/                    # UPGRADED: provider-agnostic + budget
├── security/                      # UPGRADED: taint analysis (existing)
└── dependency/                    # UPGRADED: cross-file analysis (existing)
```

Key principle: Agents stay focused on domain logic. Enterprise capabilities live in `agent_core`. No agent reimplements what `agent_core` provides.

---

## 2. Provider-Agnostic LLM Abstraction

**Pattern:** Factory registry + adapter pattern (inspired by OpenCode's 30+ providers, Aider's LiteLLM).

### Interface

```python
# agent_core/llm/provider.py
class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def complete(self, messages: list[Message], config: CompletionConfig) -> CompletionResult: ...

    @abstractmethod
    async def stream(self, messages: list[Message], config: CompletionConfig) -> AsyncIterator[Chunk]: ...

    @abstractmethod
    async def ping(self) -> bool: ...

class ProviderRegistry:
    def register(self, name: str, factory: Callable[..., LLMProvider]) -> None: ...
    def resolve(self, org_id: str) -> LLMProvider: ...
    def with_fallback(self, primary: str, *fallbacks: str) -> FallbackProvider: ...
```

### Adapters

| Adapter | SDK | Use Case |
|---------|-----|----------|
| `AnthropicProvider` | `anthropic` | Claude (current default) |
| `OpenAIProvider` | `openai` | GPT-4o/4.1 |
| `LiteLLMProvider` | `litellm` | 100+ providers (Bedrock, Vertex, Azure, etc.) |
| `LocalProvider` | `httpx` | Ollama/vLLM for air-gapped environments |

### Token Budget Manager

```python
# agent_core/llm/budget.py
class TokenBudget:
    def allocate(self, sections: dict[str, str], max_tokens: int) -> dict[str, str]:
        # Priority: system prompt > code > context > history
        # Truncates lowest-priority sections first

    def estimate_tokens(self, text: str) -> int:
        # 1 token ~ 4 chars (fast), tiktoken (accurate, optional)
```

### Fallback Chain

Primary -> Secondary -> Tertiary with automatic failover on rate limits, timeouts, or errors. Exponential backoff per provider.

### Per-Org Configuration

Stored in DB `OrgSettings.llm_provider` field. Enterprise customers set their preferred provider + API key (encrypted via existing envelope encryption). Default: Anthropic.

---

## 3. Layered PII Scrubbing

**Pattern:** Defense in depth — mandatory framework layer + optional agent-specific patterns.

### Framework-Level (Mandatory, Cannot Be Bypassed)

```python
# agent_core/scrubbing/base.py
class BaseScrubber:
    MANDATORY_PATTERNS = {
        "AWS_KEY":           r"AKIA[0-9A-Z]{16}",
        "GCP_KEY":           r"AIza[0-9A-Za-z\-_]{35}",
        "PRIVATE_KEY":       r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",
        "JWT":               r"eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+",
        "CONNECTION_STRING": r"(?:postgres|mysql|mongodb|redis)://[^\s]+",
        "SSN":               r"\b\d{3}-\d{2}-\d{4}\b",
        "EMAIL":             r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        "API_KEY":           r"(?:api[_-]?key|secret|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}",
        "BEARER_TOKEN":      r"Bearer\s+[A-Za-z0-9_\-.~+/]+=*",
        "GITHUB_TOKEN":      r"gh[pousr]_[A-Za-z0-9_]{36,}",
    }

    def scrub(self, text: str) -> ScrubResult: ...
    def audit_log(self) -> list[Redaction]: ...
```

### Agent-Specific Layer

```python
# agent_core/scrubbing/registry.py
class ScrubberRegistry:
    def register(self, agent_name: str, patterns: dict[str, str]) -> None: ...
    def scrub(self, agent_name: str, text: str) -> ScrubResult:
        # Applies base patterns FIRST, then agent-specific patterns
```

### Call Flow

```
Agent code -> ProviderRegistry.resolve() -> FallbackProvider
                                              |
                                    ScrubberRegistry.scrub()  <- mandatory base + agent patterns
                                              |
                                    TokenBudget.allocate()     <- trim to fit
                                              |
                                    LLMProvider.complete()     <- actual API call
```

---

## 4. Two-Pass Correlation Engine

**Pattern:** Independent execution -> post-hoc enrichment -> optional re-evaluation.

### Architecture

```
Pass 1: Independent Execution (all agents in parallel)
  Security, Dependency, Quality, AI-Detector, IP/License, Policy
       |
  sentinel.findings (Redis Stream)
       |
  Correlation Engine (Pass 2: Enrich + Correlate)
       |
  sentinel.findings.enriched (Redis Stream)
       |
  Optional: LLM Review re-evaluates escalated items (Pass 2b)
       |
  Assessor (existing: certificate generation)
```

### Correlation Rules (Data-Driven)

```python
CORRELATION_RULES = [
    {
        "name": "ai_generated_vulnerability",
        "when": {"agents": ["ai-detector", "security"], "same_file": True, "line_overlap": True},
        "then": {"amplify_severity": 1, "add_tag": "ai-generated-vuln", "escalate_to_llm": True},
    },
    {
        "name": "complex_vulnerable_code",
        "when": {"agents": ["quality", "security"], "same_file": True, "quality_complexity": ">15"},
        "then": {"amplify_severity": 1, "add_tag": "complex-vuln", "add_recommendation": "refactor-before-fix"},
    },
    {
        "name": "copyleft_with_cve",
        "when": {"agents": ["ip-license", "dependency"], "same_dependency": True},
        "then": {"severity": "CRITICAL", "add_tag": "copyleft-cve", "escalate_to_llm": True},
    },
    {
        "name": "policy_compound",
        "when": {"agents": ["policy", "*"], "same_file": True},
        "then": {"amplify_severity": 1, "add_tag": "policy-compound"},
    },
]
```

### Adaptive Confidence Calibration

```python
# agent_core/correlation/confidence.py
class ConfidenceCalibrator:
    def calibrate(self, finding: Finding, agent_name: str) -> Finding:
        # Looks up agent's historical precision for this category
        # Adjusts confidence based on accuracy track record

    def record_feedback(self, finding_id: str, was_accurate: bool) -> None:
        # User confirms/dismisses finding -> updates calibration
```

Key decisions:
- Correlation runs as a separate consumer on `sentinel.findings`, produces to `sentinel.findings.enriched`
- Only findings with `escalate_to_llm: True` trigger Pass 2b — keeps LLM costs bounded
- Rules are data-driven (dict/YAML), not hardcoded — enterprise customers can add custom rules
- Line overlap: `max(start1, start2) <= min(end1, end2)`

---

## 5. Real-Time Streaming (SSE + REST)

### SSE Publisher

```python
# agent_core/streaming/sse.py
class SSEPublisher:
    def __init__(self, redis_client):
        self.stream_key = "sentinel.sse:{scan_id}"

    async def publish(self, scan_id: str, event: StreamEvent) -> None: ...
    async def subscribe(self, scan_id: str) -> AsyncIterator[StreamEvent]: ...
```

### Event Types

- `finding.new` — agent produced a finding (Pass 1)
- `finding.enriched` — correlation engine enriched it (Pass 2)
- `finding.escalated` — LLM Review re-evaluated (Pass 2b)
- `agent.started` / `agent.completed` — agent lifecycle
- `scan.progress` — overall progress (agents_done / agents_total)
- `scan.completed` — all passes done, certificate ready

### API Routes

```
GET  /v1/scans/:id/stream       -> SSE endpoint (existing stub, now wired)
POST /v1/scans/:id/cancel       -> Cancel scan (kills agent consumers)
POST /v1/scans/:id/reprioritize -> Reorder agent execution
GET  /v1/scans/:id/progress     -> Poll fallback
```

### SSE Wire Format

```
event: finding.new
id: 1709312400000-0
data: {"agent":"security","severity":"HIGH","file":"src/auth.py","line":42,"title":"SQL injection"}

event: scan.progress
id: 1709312400100-0
data: {"phase":"pass1","agents_done":3,"agents_total":6,"findings":12}

event: scan.completed
id: 1709312400300-0
data: {"total_findings":18,"enriched":5,"escalated":2,"certificate_id":"cert-xyz"}
```

### Dashboard Integration

Enhance existing `use-scan-status.ts` to `use-scan-stream.ts` — EventSource with Last-Event-ID reconnection, falls back to polling if SSE fails.

Key decisions:
- SSE over WebSocket — simpler, HTTP-native, auto-reconnect via Last-Event-ID
- REST for commands — cancel/reprioritize are infrequent
- Redis Stream as SSE backbone — same infrastructure already in use
- TTL on SSE streams — 1 hour after scan completion

---

## 6. Per-Agent Enterprise Upgrades

### Quality Agent

| Capability | Current | Enterprise |
|-----------|---------|------------|
| Complexity | Regex (Python/JS) | Tree-sitter AST (30+ languages) |
| Duplication | SHA-256 sliding window | AST-normalized fingerprinting (ignores variable names) |
| Naming | Regex identifier extraction | AST-extracted declarations |
| Test coverage | File existence check | Import graph analysis |
| Caching | None | Memoized AST parses via `agent_core.cache` |

### AI Detector Agent

| Capability | Current | Enterprise |
|-----------|---------|------------|
| Classification | Fixed weights | Adaptive weights via ConfidenceCalibrator feedback |
| Entropy | Shannon on identifiers | AST-aware entropy (structure + naming + comment style) |
| Markers | Regex patterns | AST comment extraction + semantic similarity |
| Robustness | None | Adversarial test suite (obfuscated AI code) |
| New signal | -- | Commit pattern analysis (burst detection) |

### IP/License Agent

| Capability | Current | Enterprise |
|-----------|---------|------------|
| License detection | Regex headers | Tree-sitter comment extraction + SPDX expression parser |
| Fingerprinting | Empty KNOWN_OSS_HASHES dict | Populated DB (top 1000 OSS libs) + fuzzy matching |
| Conflict resolution | None | License compatibility matrix (50+ pairs) |
| Binary detection | None | Magic byte detection for vendored binaries |

### Policy Agent

| Capability | Current | Enterprise |
|-----------|---------|------------|
| Hierarchy | org -> repo (2 levels) | org -> team -> repo -> directory -> file (5 levels) |
| Rule types | 3 types | +4: require-review, enforce-format, dependency-allow, secret-scan |
| Validation | Basic field checks | JSON Schema validation + dry-run |
| Drift | None | Policy drift detection |
| Config source | Local YAML | YAML + DB-stored + Git-synced |

### LLM Review Agent

| Capability | Current | Enterprise |
|-----------|---------|------------|
| Provider | Anthropic only | agent_core.llm.ProviderRegistry (per-org config) |
| Scrubbing | Agent-level only | Layered via agent_core.scrubbing |
| Token management | 4-char estimate | TokenBudget with priority allocation |
| Error recovery | None | Reflection loop (max 3 retries) |
| Caching | Redis by content hash | Redis + confidence-gated |
| Prompt | 2 templates | Multi-template: security, license, architecture, performance |

### Framework

| Capability | Current | Enterprise |
|-----------|---------|------------|
| Execution | Single agent per process | Orchestrator coordinates all agents per scan |
| Passes | Single pass | Two-pass: independent -> correlate -> optional LLM escalation |
| Health | Basic HTTP endpoint | Structured health with per-agent status, latency p99, queue depth |
| Recovery | None | WAL-based recovery (resume from last checkpoint) |
| Retry | None | Structured retry with exponential backoff (max 3) |

### Orchestrator

```python
class ScanOrchestrator:
    async def run_scan(self, event: DiffEvent) -> ScanResult:
        # Pass 1: all agents in parallel
        tasks = [agent.run_scan(event) for agent in self.agents]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Collect findings
        all_findings = flatten(r.findings for r in results if not isinstance(r, Exception))

        # Pass 2: correlate + enrich
        enriched = self.correlation_engine.correlate(all_findings, event.scan_id)

        # Pass 2b: LLM escalation (only flagged findings)
        escalated = [f for f in enriched if f.escalate_to_llm]
        if escalated and self.llm_agent:
            llm_results = await self.llm_agent.re_evaluate(escalated, event)
            enriched = merge_llm_results(enriched, llm_results)

        return ScanResult(findings=enriched, certificate=self.assess(enriched))
```

---

## 7. Testing Strategy

### Three-Tier Testing

**Tier 1: Unit Tests (per module, no external deps)**

| Module | Focus |
|--------|-------|
| `agent_core.llm.provider` | Interface compliance, registry, fallback chain |
| `agent_core.llm.budget` | Token estimation, priority allocation, truncation |
| `agent_core.analysis.treesitter` | AST parsing for Python/JS/TS/Go/Rust/Java |
| `agent_core.analysis.complexity` | AST-based cyclomatic complexity |
| `agent_core.scrubbing.base` | All mandatory patterns, no false positives |
| `agent_core.scrubbing.registry` | Layered application order |
| `agent_core.correlation.engine` | Each correlation rule independently |
| `agent_core.correlation.confidence` | Calibration math, feedback recording |
| `agent_core.streaming.sse` | Event serialization, Last-Event-ID |
| Per-agent upgrades | Tree-sitter complexity, reflection loops, fingerprinting |

**Tier 2: Integration Tests (agents + core, mocked Redis)**

- Two-pass correlation with findings from multiple agents
- Full scan orchestration (all 6 agents -> correlation -> LLM escalation)
- SSE real-time event delivery during scan
- Provider fallback chain under simulated failures

**Tier 3: End-to-End Tests (real Redis, real agents, real SSE)**

- Known-bad diff through full pipeline, verify cross-agent correlation
- Clean diff through pipeline, verify zero false positives
- SSE client connection, reconnection, Last-Event-ID recovery
- Cancel/reprioritize during active scan

### Test Fixtures

Shared fixtures in `agents/core/tests/fixtures/`:
- `known_bad_diff.json` — SQL injection + GPL + AI-generated + complex code
- `clean_diff.json` — passes all agents, zero findings
- `mixed_diff.json` — some findings, no correlations
- `pii_heavy_code.py` — embedded secrets for scrubber testing
- `multilang/` — same logic in Python, JS, TS, Go, Rust, Java

### Target Coverage

| Tier | New Tests | Existing Tests | Total |
|------|-----------|---------------|-------|
| Unit | ~150 | 191 | ~341 |
| Integration | ~30 | -- | ~30 |
| E2E | ~10 | -- | ~10 |
| **Total** | **~190** | **191** | **~381** |

---

## Reference Patterns Applied

| Pattern | Source | Applied To |
|---------|--------|-----------|
| Tree-sitter AST (WASM) | Cline, Aider, Continue, Tabby | Quality, AI-Detector, IP/License |
| LiteLLM abstraction (100+ providers) | Aider, STORM, Suna | LLM Review, agent_core.llm |
| Token budget + compression | Suna (70-90% savings), Aider | agent_core.llm.budget |
| Reflection loop (max 3 retries) | Aider, MetaGPT, ChatDev | LLM Review, Framework |
| Message routing + pub/sub | MetaGPT, Agent Orchestrator | Correlation Engine |
| WAL-based recovery | Suna | Framework orchestrator |
| Reciprocal Rank Fusion | Tabby | agent_core.analysis.search |
| Config precedence ladder | OpenCode (7 levels) | Policy Agent (5-level hierarchy) |
| AsyncGenerator streaming | Continue, Cline | SSE Publisher |
| Data-driven correlation rules | MetaGPT memory index | Correlation Engine |
| Adaptive confidence | Pearl RL feedback | ConfidenceCalibrator |
| Stateless coordinator | Suna | ScanOrchestrator |
