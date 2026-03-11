# Enterprise Agent Upgrades — Implementation Plan

> **Source design:** `2026-03-11-enterprise-agents-design.md`
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

---

## Phase 1: Core Package Foundation (`agents/core/`)

### Task 1.1 — Scaffold `agents/core/` package
**Create** `agents/core/` with pyproject.toml and package structure.

**Files to create:**
- `agents/core/pyproject.toml` — name: `sentinel-agent-core`, deps: `redis>=5.0`, `litellm>=1.30`, `tree-sitter>=0.22`, `anthropic>=0.25`, `openai>=1.20`, `httpx>=0.27`
- `agents/core/agent_core/__init__.py` — re-export key classes
- `agents/core/agent_core/llm/__init__.py`
- `agents/core/agent_core/analysis/__init__.py`
- `agents/core/agent_core/scrubbing/__init__.py`
- `agents/core/agent_core/streaming/__init__.py`
- `agents/core/agent_core/correlation/__init__.py`
- `agents/core/agent_core/cache.py` — `RedisCache` class wrapping Redis GET/SET with TTL + JSON serialization
- `agents/core/tests/__init__.py`

**Verification:** `cd agents/core && pip install -e ".[dev]"` succeeds, `python -c "import agent_core"` works.

---

### Task 1.2 — LLM Provider Abstraction
**Create** provider-agnostic LLM layer per design doc section 2.

**Files to create:**
- `agents/core/agent_core/llm/types.py` — `Message`, `CompletionConfig`, `CompletionResult`, `Chunk` dataclasses
- `agents/core/agent_core/llm/provider.py` — `LLMProvider` ABC, `ProviderRegistry` (register/resolve/with_fallback), `FallbackProvider`
- `agents/core/agent_core/llm/anthropic.py` — `AnthropicProvider(LLMProvider)` using `anthropic` SDK
- `agents/core/agent_core/llm/openai.py` — `OpenAIProvider(LLMProvider)` using `openai` SDK
- `agents/core/agent_core/llm/litellm_provider.py` — `LiteLLMProvider(LLMProvider)` using `litellm`
- `agents/core/agent_core/llm/local.py` — `LocalProvider(LLMProvider)` using `httpx` for Ollama/vLLM
- `agents/core/agent_core/llm/budget.py` — `TokenBudget` class with `allocate()` and `estimate_tokens()`

**Files to create (tests):**
- `agents/core/tests/test_llm_provider.py` — registry, resolve, fallback chain, ping
- `agents/core/tests/test_llm_budget.py` — token estimation, priority allocation, truncation edge cases
- `agents/core/tests/test_llm_anthropic.py` — mock SDK, verify complete/stream/ping
- `agents/core/tests/test_llm_fallback.py` — primary fail -> secondary, rate limit backoff

**Verification:** `cd agents/core && pytest tests/test_llm_*.py -v` — all pass.

---

### Task 1.3 — Layered PII Scrubbing
**Create** layered scrubbing per design doc section 3.

**Files to create:**
- `agents/core/agent_core/scrubbing/types.py` — `ScrubResult`, `Redaction` dataclasses
- `agents/core/agent_core/scrubbing/base.py` — `BaseScrubber` with 10 mandatory patterns (AWS_KEY, GCP_KEY, PRIVATE_KEY, JWT, CONNECTION_STRING, SSN, EMAIL, API_KEY, BEARER_TOKEN, GITHUB_TOKEN), `scrub()` returns `ScrubResult`, `audit_log()` returns redactions
- `agents/core/agent_core/scrubbing/registry.py` — `ScrubberRegistry` with `register(agent_name, patterns)` and `scrub(agent_name, text)` that applies base FIRST then agent-specific

**Files to create (tests):**
- `agents/core/tests/test_scrubbing_base.py` — each of 10 patterns individually, no false positives on normal code, multiple secrets in one string
- `agents/core/tests/test_scrubbing_registry.py` — layered order, agent-specific patterns, audit log

**Verification:** `cd agents/core && pytest tests/test_scrubbing_*.py -v` — all pass.

---

### Task 1.4 — Tree-sitter AST Analysis
**Create** tree-sitter wrapper per design doc section 6 (Quality/AI-Detector/IP-License tables).

**Files to create:**
- `agents/core/agent_core/analysis/treesitter.py` — `parse_code(code, language) -> Tree`, `extract_functions(tree) -> list[FunctionNode]`, `extract_comments(tree) -> list[Comment]`, `extract_identifiers(tree) -> list[Identifier]`. Support languages: Python, JavaScript, TypeScript, Go, Rust, Java, Ruby, C, C++. Language detection from file extension.
- `agents/core/agent_core/analysis/complexity.py` — `calculate_complexity(code, language) -> list[ComplexityResult]` using tree-sitter AST. Count decision nodes (if/elif/for/while/and/or/except/case/match) per function. Replace regex-based approach.
- `agents/core/agent_core/analysis/fingerprint.py` — `fingerprint_code(code, language) -> str` using AST-normalized form (strip variable names, normalize whitespace). `match_known_oss(fingerprint) -> OSSMatch | None` against hash DB. `FingerprintDB` class with load/save/lookup.
- `agents/core/agent_core/analysis/search.py` — `bm25_search(query, documents)`, `rrf_merge(ranked_lists)` for Reciprocal Rank Fusion

**Files to create (tests):**
- `agents/core/tests/test_treesitter.py` — parse Python/JS/TS/Go/Rust/Java, extract functions, extract comments, language detection
- `agents/core/tests/test_complexity_ast.py` — known complexity scores for sample functions across languages
- `agents/core/tests/test_fingerprint.py` — AST normalization, same logic different variable names -> same fingerprint
- `agents/core/tests/test_search.py` — BM25 ranking, RRF merge

**Verification:** `cd agents/core && pytest tests/test_treesitter.py tests/test_complexity_ast.py tests/test_fingerprint.py tests/test_search.py -v` — all pass.

---

### Task 1.5 — Correlation Engine
**Create** two-pass correlation per design doc section 4.

**Files to create:**
- `agents/core/agent_core/correlation/types.py` — `CorrelationRule` dataclass, `EnrichedFinding` (extends Finding with `tags`, `recommendations`, `escalate_to_llm`, `correlated_with`)
- `agents/core/agent_core/correlation/engine.py` — `CorrelationEngine` class. `correlate(findings: list[Finding], scan_id: str) -> list[EnrichedFinding]`. Implements 4 built-in rules from design: `ai_generated_vulnerability`, `complex_vulnerable_code`, `copyleft_with_cve`, `policy_compound`. Line overlap: `max(start1, start2) <= min(end1, end2)`. Supports custom rules via `add_rule()`.
- `agents/core/agent_core/correlation/confidence.py` — `ConfidenceCalibrator` class. `calibrate(finding, agent_name) -> Finding` adjusts confidence based on historical precision. `record_feedback(finding_id, was_accurate)` updates calibration data in Redis.

**Files to create (tests):**
- `agents/core/tests/test_correlation_engine.py` — each of 4 rules independently, no-match scenario, custom rule, line overlap math
- `agents/core/tests/test_confidence.py` — calibration adjustment, feedback recording, cold-start behavior

**Verification:** `cd agents/core && pytest tests/test_correlation_*.py tests/test_confidence.py -v` — all pass.

---

### Task 1.6 — SSE Streaming
**Create** real-time streaming per design doc section 5.

**Files to create:**
- `agents/core/agent_core/streaming/types.py` — `StreamEvent` dataclass with `event_type`, `data`, `id` fields. Event types: `finding.new`, `finding.enriched`, `finding.escalated`, `agent.started`, `agent.completed`, `scan.progress`, `scan.completed`
- `agents/core/agent_core/streaming/sse.py` — `SSEPublisher` class. `publish(scan_id, event)` writes to Redis Stream `sentinel.sse:{scan_id}`. `subscribe(scan_id) -> AsyncIterator[StreamEvent]` reads with XREAD. TTL: 1 hour after scan completion.
- `agents/core/agent_core/streaming/signals.py` — `AgentSignal` enum (STARTED, COMPLETED, ERROR, CANCELLED), inter-agent signal types

**Files to create (tests):**
- `agents/core/tests/test_sse.py` — publish/subscribe round-trip, event serialization, Last-Event-ID resume, TTL expiry
- `agents/core/tests/test_signals.py` — signal type serialization

**Verification:** `cd agents/core && pytest tests/test_sse.py tests/test_signals.py -v` — all pass.

---

## Phase 2: Framework Enhancement (`agents/framework/`)

### Task 2.1 — Orchestrator
**Create** multi-agent coordinator per design doc section 6 (Framework table + Orchestrator code).

**Files to create:**
- `agents/framework/sentinel_agents/orchestrator.py` — `ScanOrchestrator` class. `run_scan(event: DiffEvent) -> ScanResult`: Pass 1 (all agents parallel via `asyncio.gather`), collect findings, Pass 2 (correlate via `CorrelationEngine`), Pass 2b (LLM escalation for `escalate_to_llm` findings only). Publishes SSE events at each stage.

**Files to modify:**
- `agents/framework/sentinel_agents/__init__.py` — export `ScanOrchestrator`
- `agents/framework/pyproject.toml` — add `sentinel-agent-core` dependency

**Files to create (tests):**
- `agents/framework/tests/test_orchestrator.py` — mock agents, verify two-pass flow, verify SSE events published, verify LLM escalation only for flagged findings, verify error handling (one agent fails, others continue)

**Verification:** `cd agents/framework && pytest tests/test_orchestrator.py -v` — all pass.

---

### Task 2.2 — Enhanced Runner
**Modify** existing runner for retry, WAL recovery, and structured health.

**Files to modify:**
- `agents/framework/sentinel_agents/runner.py` — Add: structured retry with exponential backoff (max 3 attempts, base 1s), WAL-based checkpoint (write scan_id + agent_name + last_processed_id to Redis hash `sentinel.wal:{scan_id}`), enhanced health endpoint returning `{"name", "version", "status", "agents": {...}, "latency_p99_ms", "queue_depth"}`

**Files to create (tests):**
- `agents/framework/tests/test_runner_retry.py` — retry on transient error, max attempts, backoff timing
- `agents/framework/tests/test_runner_wal.py` — checkpoint write, resume from checkpoint after crash

**Verification:** `cd agents/framework && pytest tests/ -v` — all pass including existing tests.

---

## Phase 3: Agent Upgrades (parallel — each independent)

### Task 3.1 — Quality Agent: Tree-sitter AST Upgrade
**Modify** quality agent to use `agent_core.analysis` per design doc section 6.

**Files to modify:**
- `agents/quality/sentinel_quality/complexity.py` — Replace regex-based complexity with `agent_core.analysis.complexity.calculate_complexity()`. Support 30+ languages via tree-sitter. Keep same `ComplexityResult` interface.
- `agents/quality/sentinel_quality/duplication.py` — Replace SHA-256 sliding window with AST-normalized fingerprinting via `agent_core.analysis.fingerprint.fingerprint_code()`. Ignores variable names for better semantic matching.
- `agents/quality/sentinel_quality/naming.py` — Replace regex identifier extraction with `agent_core.analysis.treesitter.extract_identifiers()`. Same naming style classification.
- `agents/quality/sentinel_quality/test_coverage.py` — Enhance file existence check with import graph analysis via `agent_core.analysis.treesitter.extract_functions()` + import extraction.
- `agents/quality/sentinel_quality/agent.py` — Add memoized AST cache via `agent_core.cache.RedisCache`.
- `agents/quality/pyproject.toml` — Add `sentinel-agent-core` dependency.

**Files to create/modify (tests):**
- `agents/quality/tests/test_complexity.py` — Update for tree-sitter results, add Go/Rust/Java test cases
- `agents/quality/tests/test_duplication.py` — Test AST-normalized fingerprinting
- `agents/quality/tests/test_naming.py` — Test AST-extracted identifiers
- `agents/quality/tests/test_agent.py` — Update for new analysis paths

**Verification:** `cd agents/quality && .venv/bin/pytest tests/ -v` — all pass.

---

### Task 3.2 — AI Detector Agent: Ensemble Calibration Upgrade
**Modify** AI detector to use AST analysis and adaptive confidence per design doc section 6.

**Files to modify:**
- `agents/ai-detector/sentinel_aidetector/stylometric.py` — Replace Shannon entropy on raw tokens with AST-aware entropy: structure entropy (tree depth/branching) + naming entropy (identifier patterns) + comment style entropy. Use `agent_core.analysis.treesitter` for AST parsing.
- `agents/ai-detector/sentinel_aidetector/markers.py` — Replace regex-only markers with AST comment extraction via `agent_core.analysis.treesitter.extract_comments()` + semantic similarity matching.
- `agents/ai-detector/sentinel_aidetector/timing.py` — Add commit pattern analysis: burst detection (many files in short time window), uniform commit sizes.
- `agents/ai-detector/sentinel_aidetector/agent.py` — Replace fixed weights with adaptive weights via `agent_core.correlation.confidence.ConfidenceCalibrator`. Weights adjust based on feedback.
- `agents/ai-detector/pyproject.toml` — Add `sentinel-agent-core` dependency.

**Files to create/modify (tests):**
- `agents/ai-detector/tests/test_stylometric.py` — AST-aware entropy for Python/JS/TS, known AI-generated vs human code samples
- `agents/ai-detector/tests/test_markers.py` — AST comment extraction, semantic matching
- `agents/ai-detector/tests/test_timing.py` — Burst detection, uniform commit patterns
- `agents/ai-detector/tests/test_agent.py` — Adaptive weight calibration, adversarial samples (obfuscated AI code)

**Verification:** `cd agents/ai-detector && .venv/bin/pytest tests/ -v` — all pass.

---

### Task 3.3 — IP/License Agent: Fingerprint DB + SPDX Upgrade
**Modify** IP/license agent per design doc section 6.

**Files to modify:**
- `agents/ip-license/sentinel_license/spdx_detector.py` — Replace regex license headers with tree-sitter comment extraction via `agent_core.analysis.treesitter.extract_comments()`. Add SPDX expression parser (handles `AND`, `OR`, `WITH` operators). Add license compatibility matrix (50+ pairs: MIT+Apache=OK, MIT+GPL=copyleft, Apache+AGPL=conflict, etc.).
- `agents/ip-license/sentinel_license/fingerprint.py` — Replace empty `KNOWN_OSS_HASHES` with populated fingerprint DB (top 1000 OSS libs). Use `agent_core.analysis.fingerprint` for AST-normalized fuzzy matching. Add magic byte detection for vendored binaries (ELF, Mach-O, PE, JAR, WASM headers).
- `agents/ip-license/sentinel_license/agent.py` — Wire new capabilities, add license conflict reporting.
- `agents/ip-license/pyproject.toml` — Add `sentinel-agent-core` dependency.

**Files to create:**
- `agents/ip-license/sentinel_license/compatibility.py` — `LicenseCompatibility` class with `check(license_a, license_b) -> CompatResult`. Pre-loaded matrix of 50+ common pairs.
- `agents/ip-license/sentinel_license/binary_detect.py` — `detect_binary(content: bytes) -> BinaryInfo | None`. Magic bytes for ELF, Mach-O, PE, JAR, WASM.
- `agents/ip-license/data/oss_fingerprints.json` — Seed data for top 1000 OSS fingerprints (can be populated incrementally).

**Files to create/modify (tests):**
- `agents/ip-license/tests/test_spdx.py` — SPDX expression parsing, compatibility matrix
- `agents/ip-license/tests/test_fingerprint.py` — Fuzzy matching, known OSS detection
- `agents/ip-license/tests/test_compatibility.py` — Matrix lookups, conflict detection
- `agents/ip-license/tests/test_binary.py` — Magic byte detection for each format
- `agents/ip-license/tests/test_agent.py` — End-to-end with new capabilities

**Verification:** `cd agents/ip-license && .venv/bin/pytest tests/ -v` — all pass.

---

### Task 3.4 — Policy Agent: Hierarchical Merge Upgrade
**Modify** policy agent per design doc section 6.

**Files to modify:**
- `agents/policy/sentinel_policy/parser.py` — Extend `VALID_RULE_TYPES` with 4 new types: `require-review`, `enforce-format`, `dependency-allow`, `secret-scan`. Add JSON Schema validation for policy YAML. Add dry-run capability (validate without evaluating).
- `agents/policy/sentinel_policy/merge.py` — Extend from 2-level (org -> repo) to 5-level hierarchy: org -> team -> repo -> directory -> file. More specific level overrides less specific. Same rule name at lower level replaces higher.
- `agents/policy/sentinel_policy/rules.py` — Add evaluation for 4 new rule types: `require-review` (check for approval markers), `enforce-format` (naming conventions per file type), `dependency-allow` (allowlist check), `secret-scan` (enhanced pattern matching).
- `agents/policy/sentinel_policy/agent.py` — Accept 5-level policy hierarchy in constructor. Add policy drift detection (compare current files against policy expectations).
- `agents/policy/pyproject.toml` — Add `sentinel-agent-core` dependency (for cache), `jsonschema>=4.20`.

**Files to create:**
- `agents/policy/sentinel_policy/drift.py` — `detect_drift(current_state, policy) -> list[DriftViolation]`. Compare actual file state against policy expectations.
- `agents/policy/sentinel_policy/schema.py` — JSON Schema definition for policy YAML validation.

**Files to create/modify (tests):**
- `agents/policy/tests/test_parser.py` — 4 new rule types, JSON Schema validation, dry-run
- `agents/policy/tests/test_merge.py` — 5-level hierarchy, override semantics
- `agents/policy/tests/test_rules.py` — Evaluation for each new rule type
- `agents/policy/tests/test_drift.py` — Drift detection scenarios
- `agents/policy/tests/test_agent.py` — Full pipeline with 5-level hierarchy

**Verification:** `cd agents/policy && .venv/bin/pytest tests/ -v` — all pass.

---

### Task 3.5 — LLM Review Agent: Provider-Agnostic + Reflection Upgrade
**Modify** LLM review agent per design doc section 6.

**Files to modify:**
- `agents/llm-review/sentinel_llm/agent.py` — Replace `LLMCallable` with `agent_core.llm.ProviderRegistry.resolve(org_id)`. Add reflection loop: if LLM response fails parsing, retry with error feedback (max 3 attempts). Add `re_evaluate(findings, event)` method for Pass 2b escalation.
- `agents/llm-review/sentinel_llm/scrubber.py` — Replace standalone scrubber with `agent_core.scrubbing.ScrubberRegistry`. Register LLM-specific patterns (prompt injection markers, system prompts).
- `agents/llm-review/sentinel_llm/prompt_builder.py` — Add multi-template support: `security`, `license`, `architecture`, `performance`. Template selection based on finding type or scan config.
- `agents/llm-review/sentinel_llm/cache.py` — Add confidence-gated caching: only cache results above confidence threshold. Use `agent_core.cache.RedisCache` as backend.
- `agents/llm-review/sentinel_llm/response_parser.py` — Add structured error extraction for reflection loop feedback.
- `agents/llm-review/pyproject.toml` — Replace direct SDK deps with `sentinel-agent-core`.

**Files to create/modify (tests):**
- `agents/llm-review/tests/test_agent.py` — Provider registry integration, reflection loop (1st fail + 2nd succeed, max retries), re_evaluate for escalated findings
- `agents/llm-review/tests/test_scrubber.py` — Layered scrubbing via registry, LLM-specific patterns
- `agents/llm-review/tests/test_prompt_builder.py` — Multi-template selection, budget allocation
- `agents/llm-review/tests/test_cache.py` — Confidence-gated caching, TTL behavior
- `agents/llm-review/tests/test_response_parser.py` — Structured error for reflection

**Verification:** `cd agents/llm-review && .venv/bin/pytest tests/ -v` — all pass.

---

### Task 3.6 — Security Agent: Taint Analysis Enhancement
**Modify** existing security agent to use `agent_core` for cross-file awareness.

**Files to modify:**
- `agents/security/sentinel_security/agent.py` — Add optional taint analysis pass using `agent_core.analysis.treesitter` to trace data flow across function boundaries within the diff. Existing Semgrep + custom rules remain primary scanners.
- `agents/security/pyproject.toml` — Add `sentinel-agent-core` dependency.

**Files to create/modify (tests):**
- `agents/security/tests/test_taint.py` — Cross-function taint tracking within diff

**Verification:** `cd agents/security && .venv/bin/pytest tests/ -v` — all 30+ existing tests pass + new taint tests.

---

### Task 3.7 — Dependency Agent: Cross-File Analysis Enhancement
**Modify** existing dependency agent for cross-file manifest awareness.

**Files to modify:**
- `agents/dependency/sentinel_dependency/agent.py` — Add cross-file manifest detection: if a diff touches multiple manifests (e.g., package.json + requirements.txt), correlate shared dependencies. Use `agent_core.cache` for OSV response caching.
- `agents/dependency/pyproject.toml` — Add `sentinel-agent-core` dependency.

**Files to create/modify (tests):**
- `agents/dependency/tests/test_cross_manifest.py` — Multi-manifest correlation

**Verification:** `cd agents/dependency && .venv/bin/pytest tests/ -v` — all 52+ existing tests pass + new tests.

---

## Phase 4: API + Dashboard Integration

### Task 4.1 — SSE API Endpoint Wiring
**Modify** API to serve SSE events from Redis Stream.

**Files to modify:**
- `apps/api/src/routes/scans.ts` — Wire existing `/v1/scans/:id/stream` stub to read from `sentinel.sse:{scan_id}` Redis Stream. Support `Last-Event-ID` header for reconnection. Add `/v1/scans/:id/cancel` (POST) and `/v1/scans/:id/progress` (GET poll fallback).

**Files to create (tests):**
- `apps/api/src/routes/__tests__/scans-stream.test.ts` — SSE event format, Last-Event-ID resume, cancel endpoint

**Verification:** `cd apps/api && npx turbo test` — all pass.

---

### Task 4.2 — Dashboard SSE Hook
**Modify** dashboard to consume real-time scan events.

**Files to create:**
- `apps/dashboard/src/hooks/use-scan-stream.ts` — EventSource hook with: auto-reconnect via Last-Event-ID, fallback to polling if SSE fails, typed event handlers for each event type, connection state management.

**Files to modify:**
- Scan detail page component — Replace polling with `use-scan-stream` hook. Show real-time finding count, agent progress, correlation badges.

**Verification:** Manual test — start scan, observe real-time updates in dashboard.

---

## Phase 5: Integration Testing

### Task 5.1 — Shared Test Fixtures
**Create** shared fixtures for cross-agent testing.

**Files to create:**
- `agents/core/tests/fixtures/known_bad_diff.json` — Diff containing: SQL injection in auth.py, GPL header in lib.py, AI-generated utils.py (low entropy + Copilot marker), high complexity function, policy-violating import
- `agents/core/tests/fixtures/clean_diff.json` — Clean diff, zero findings expected
- `agents/core/tests/fixtures/mixed_diff.json` — Some findings but no cross-agent correlations
- `agents/core/tests/fixtures/pii_heavy_code.py` — Embedded AWS keys, JWTs, emails, connection strings
- `agents/core/tests/fixtures/multilang/` — Same logic in Python, JS, TS, Go, Rust, Java

**Verification:** Files exist and are valid JSON/code.

---

### Task 5.2 — Integration Tests
**Create** integration tests using shared fixtures.

**Files to create:**
- `agents/core/tests/integration/test_two_pass_correlation.py` — Feed known_bad_diff through all agents, verify correlation rules fire correctly
- `agents/core/tests/integration/test_full_scan.py` — Orchestrator runs all 6 agents, verify finding count and enrichment
- `agents/core/tests/integration/test_sse_during_scan.py` — Verify SSE events published during orchestrated scan
- `agents/core/tests/integration/test_provider_fallback.py` — Primary provider fails, verify fallback works

**Verification:** `cd agents/core && pytest tests/integration/ -v` — all pass.

---

### Task 5.3 — End-to-End Tests
**Create** E2E tests with real Redis.

**Files to create:**
- `agents/core/tests/e2e/test_pipeline.py` — Full pipeline: diff event -> Redis -> agents -> correlation -> SSE -> certificate
- `agents/core/tests/e2e/test_sse_reconnect.py` — SSE client disconnect/reconnect with Last-Event-ID
- `agents/core/tests/e2e/test_cancel_scan.py` — Cancel active scan, verify agents stop

**Verification:** `cd agents/core && pytest tests/e2e/ -v --timeout=60` — all pass (requires running Redis).

---

## Execution Order & Dependencies

```
Phase 1 (Core):
  1.1 Scaffold ─┬─> 1.2 LLM Provider
                 ├─> 1.3 PII Scrubbing
                 ├─> 1.4 Tree-sitter AST
                 ├─> 1.5 Correlation Engine
                 └─> 1.6 SSE Streaming

Phase 2 (Framework): depends on Phase 1
  2.1 Orchestrator ──> 2.2 Enhanced Runner

Phase 3 (Agents): depends on Phase 1, parallel with Phase 2
  3.1 Quality       (needs 1.4)
  3.2 AI Detector   (needs 1.4, 1.5)
  3.3 IP/License    (needs 1.4)
  3.4 Policy        (needs 1.1)
  3.5 LLM Review    (needs 1.2, 1.3)
  3.6 Security      (needs 1.4)
  3.7 Dependency    (needs 1.1)

Phase 4 (API/Dashboard): depends on Phase 1.6
  4.1 SSE API ──> 4.2 Dashboard Hook

Phase 5 (Integration): depends on all above
  5.1 Fixtures ──> 5.2 Integration Tests ──> 5.3 E2E Tests
```

## Summary

| Phase | Tasks | New Files | Modified Files | New Tests |
|-------|-------|-----------|---------------|-----------|
| 1. Core | 6 | ~25 | 0 | ~60 |
| 2. Framework | 2 | 1 | 3 | ~15 |
| 3. Agents | 7 | ~5 | ~20 | ~60 |
| 4. API/Dashboard | 2 | 2 | 2 | ~5 |
| 5. Integration | 3 | ~12 | 0 | ~10 |
| **Total** | **20** | **~45** | **~25** | **~150** |
