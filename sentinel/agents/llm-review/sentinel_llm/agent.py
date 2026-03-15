"""LLM Review Agent — performs AI-assisted security and license review.

Uses provider-agnostic LLM layer from agent_core. Supports reflection loop
(retry with error feedback on parse failure) and re_evaluate for Pass 2b
escalation.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, DiffFile, Finding, FindingEvent

from sentinel_llm.cache import ReviewCache
from sentinel_llm.prompt_builder import build_review_prompt, truncate_to_budget
from sentinel_llm.response_parser import extract_parse_errors, parse_llm_findings
from sentinel_llm.scrubber import scrub

logger = logging.getLogger(__name__)

# Type alias for the LLM callable (kept for backward compat).
# Signature: (prompt: str) -> str
LLMCallable = Callable[[str], str]

# Maximum reflection retries on parse failure
MAX_REFLECTION_RETRIES = 3


def _extract_added_code(diff_file: DiffFile) -> str:
    """Extract added lines (lines starting with '+') from all hunks."""
    lines: list[str] = []
    for hunk in diff_file.hunks:
        for line in hunk.content.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(line[1:])  # strip the leading '+'
    return "\n".join(lines)


def _resolve_llm_fn(
    llm_fn: LLMCallable | None = None,
    provider: Any | None = None,
    org_id: str = "",
) -> LLMCallable | None:
    """Resolve an LLM callable from either a direct callable or a ProviderRegistry.

    Priority:
    1. Direct ``llm_fn`` callable (backward compat)
    2. ``provider`` — an ``agent_core.llm.ProviderRegistry`` instance resolved per org_id
    3. None (graceful degradation)
    """
    if llm_fn is not None:
        return llm_fn

    if provider is not None:
        # provider is a ProviderRegistry or LLMProvider
        try:
            from agent_core.llm.provider import ProviderRegistry, LLMProvider
            from agent_core.llm.types import CompletionConfig, Message, Role

            if isinstance(provider, ProviderRegistry):
                resolved = provider.resolve(org_id)
            elif isinstance(provider, LLMProvider):
                resolved = provider
            else:
                logger.warning("Unknown provider type: %s", type(provider))
                return None

            def _call_provider(prompt: str) -> str:
                config = CompletionConfig(temperature=0.0, json_mode=True)
                messages = [Message(role=Role.USER, content=prompt)]
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as pool:
                            result = pool.submit(
                                asyncio.run, resolved.complete(messages, config)
                            ).result()
                    else:
                        result = loop.run_until_complete(resolved.complete(messages, config))
                except RuntimeError:
                    result = asyncio.run(resolved.complete(messages, config))
                return result.content

            return _call_provider
        except ImportError:
            logger.warning("agent_core.llm not available for provider resolution")
            return None

    return None


class LLMReviewAgent(BaseAgent):
    """Agent that uses an LLM to perform security and license reviews.

    Parameters
    ----------
    llm_fn:
        A callable ``(prompt: str) -> str`` that calls the LLM.  If ``None``
        the agent degrades gracefully and returns empty findings.
    cache:
        An optional :class:`ReviewCache` for caching results.
    provider:
        An ``agent_core.llm.ProviderRegistry`` or ``LLMProvider`` instance.
        Used when ``llm_fn`` is not provided. Resolved per ``org_id``.
    org_id:
        Organization ID for provider resolution (used with ``provider``).
    review_type:
        Template to use: ``"security"``, ``"license"``, ``"architecture"``,
        or ``"performance"``.  Defaults to ``"security"``.
    confidence_threshold:
        Minimum confidence (0.0-1.0) for caching results.  Results below
        this threshold are not cached.
    """

    name = "llm-review"
    version = "0.2.0"
    ruleset_version = "llm-0.2.0"
    ruleset_hash = ""

    def __init__(
        self,
        llm_fn: LLMCallable | None = None,
        cache: ReviewCache | None = None,
        *,
        provider: Any | None = None,
        org_id: str = "",
        review_type: str = "security",
        confidence_threshold: float = 0.0,
    ) -> None:
        self._llm_fn = _resolve_llm_fn(llm_fn, provider, org_id)
        self._cache = cache
        self._review_type = review_type
        self._confidence_threshold = confidence_threshold

    # ------------------------------------------------------------------
    # BaseAgent interface
    # ------------------------------------------------------------------

    def process(self, event: DiffEvent) -> list[Finding]:
        """Analyze each file in *event* via scrub -> cache -> LLM -> parse."""
        all_findings: list[Finding] = []

        if self._llm_fn is None:
            logger.warning("No LLM function configured — returning empty findings")
            return []

        for diff_file in event.files:
            findings = self._review_file(diff_file)
            all_findings.extend(findings)

        return all_findings

    def run_scan(self, event: DiffEvent) -> FindingEvent:
        """Override to attach a RE_EVALUATE signal after processing findings."""
        result = super().run_scan(event)
        result.extra["re_evaluate_event"] = {
            "type": "RE_EVALUATE",
            "scanId": event.scan_id,
            "trigger": "llm-review-complete",
        }
        return result

    def re_evaluate(self, findings: list[Finding], event: DiffEvent) -> list[Finding]:
        """Pass 2b escalation: re-review findings from other agents.

        Takes findings from deterministic agents and asks the LLM to assess
        whether they are true positives, false positives, or need escalation.
        """
        if self._llm_fn is None or not findings:
            return findings

        finding_summaries = []
        for f in findings:
            finding_summaries.append(
                f"- [{f.severity.value}] {f.title} in {f.file}:{f.line_start} — {f.description}"
            )

        prompt = (
            "You are a senior security engineer performing a second-pass review.\n"
            "The following findings were flagged by automated scanners.\n"
            "For each finding, assess if it is a TRUE POSITIVE, FALSE POSITIVE, "
            "or needs ESCALATION.\n\n"
            "Respond with a JSON array where each item has:\n"
            '  - "original_title": the finding title\n'
            '  - "verdict": "true_positive", "false_positive", or "escalate"\n'
            '  - "reasoning": brief explanation\n\n'
            "Findings:\n" + "\n".join(finding_summaries) + "\n\n"
            "Respond ONLY with the JSON array."
        )

        try:
            response = self._llm_fn(prompt)
        except Exception:
            logger.exception("LLM re_evaluate call failed")
            return findings

        # Parse verdicts and filter out false positives
        from sentinel_llm.response_parser import _extract_json_array

        verdicts = _extract_json_array(response)
        false_positive_titles = set()
        for v in verdicts:
            if isinstance(v, dict) and v.get("verdict") == "false_positive":
                false_positive_titles.add(v.get("original_title", ""))

        return [f for f in findings if f.title not in false_positive_titles]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _review_file(self, diff_file: DiffFile) -> list[Finding]:
        """Run review on a single file with reflection loop."""
        added_code = _extract_added_code(diff_file)
        if not added_code.strip():
            return []

        # 1. Mandatory scrub
        scrub_result = scrub(added_code)
        clean_code = scrub_result.sanitized_code

        # 2. Check cache (sync wrapper — cache is async but we call from sync)
        content_hash = ReviewCache.hash_content(clean_code)
        cached = self._sync_cache_get(content_hash)
        if cached is not None:
            return cached

        # 3. Build prompt & enforce token budget
        prompt = build_review_prompt(
            code=clean_code,
            file_path=diff_file.path,
            language=diff_file.language,
            review_type=self._review_type,
        )
        prompt = truncate_to_budget(prompt)

        # 4. Call LLM with reflection loop
        findings = self._call_with_reflection(prompt, diff_file)

        # 5. Cache result (confidence-gated)
        if self._should_cache(findings):
            self._sync_cache_set(content_hash, findings)

        return findings

    def _call_with_reflection(
        self, prompt: str, diff_file: DiffFile
    ) -> list[Finding]:
        """Call LLM with retry-on-parse-failure reflection loop."""
        last_response = ""
        for attempt in range(MAX_REFLECTION_RETRIES):
            try:
                if attempt == 0:
                    response_text = self._llm_fn(prompt)
                else:
                    # Reflection: include error feedback
                    errors = extract_parse_errors(last_response)
                    reflection_prompt = (
                        f"{prompt}\n\n"
                        f"[REFLECTION] Your previous response could not be parsed.\n"
                        f"Errors: {errors}\n"
                        f"Please respond with a valid JSON array only."
                    )
                    response_text = self._llm_fn(reflection_prompt)

                last_response = response_text
                findings = parse_llm_findings(
                    response_text=response_text,
                    file_path=diff_file.path,
                    review_type=self._review_type,
                )

                # If we got valid findings or an empty list from valid JSON, return
                if findings is not None:
                    return findings

            except Exception:
                logger.exception(
                    "LLM call failed for file %s (attempt %d)",
                    diff_file.path,
                    attempt + 1,
                )
                return []

        # All retries exhausted
        logger.warning(
            "All %d reflection attempts failed for %s",
            MAX_REFLECTION_RETRIES,
            diff_file.path,
        )
        return []

    def _should_cache(self, findings: list[Finding]) -> bool:
        """Check if findings meet the confidence threshold for caching."""
        if self._confidence_threshold <= 0.0:
            return True
        if not findings:
            return True  # Cache empty results (clean code)

        # Map confidence to numeric values
        conf_values = {"high": 1.0, "medium": 0.6, "low": 0.3}
        avg_confidence = sum(
            conf_values.get(f.confidence.value, 0.5) for f in findings
        ) / len(findings)
        return avg_confidence >= self._confidence_threshold

    def _sync_cache_get(self, content_hash: str) -> list[Finding] | None:
        """Synchronous cache lookup (wraps async cache if present)."""
        if self._cache is None:
            return None
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                return None
            return loop.run_until_complete(self._cache.get(content_hash))
        except RuntimeError:
            return asyncio.run(self._cache.get(content_hash))
        except Exception:
            logger.warning("Cache get failed", exc_info=True)
            return None

    def _sync_cache_set(self, content_hash: str, findings: list[Finding]) -> None:
        """Synchronous cache store (wraps async cache if present)."""
        if self._cache is None:
            return
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                return
            loop.run_until_complete(self._cache.set(content_hash, findings))
        except RuntimeError:
            asyncio.run(self._cache.set(content_hash, findings))
        except Exception:
            logger.warning("Cache set failed", exc_info=True)
