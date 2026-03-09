"""LLM Review Agent — performs AI-assisted security and license review.

Only reviews code that has been escalated by deterministic agents via the
``sentinel.escalations`` stream.  All code is scrubbed of PII/secrets
before being sent to the LLM.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, DiffFile, Finding, FindingEvent

from sentinel_llm.cache import ReviewCache
from sentinel_llm.prompt_builder import build_security_review_prompt, truncate_to_budget
from sentinel_llm.response_parser import parse_llm_findings
from sentinel_llm.scrubber import scrub

logger = logging.getLogger(__name__)

# Type alias for the LLM callable.
# Signature: (prompt: str) -> str
LLMCallable = Callable[[str], str]


def _extract_added_code(diff_file: DiffFile) -> str:
    """Extract added lines (lines starting with '+') from all hunks."""
    lines: list[str] = []
    for hunk in diff_file.hunks:
        for line in hunk.content.splitlines():
            if line.startswith("+") and not line.startswith("+++"):
                lines.append(line[1:])  # strip the leading '+'
    return "\n".join(lines)


class LLMReviewAgent(BaseAgent):
    """Agent that uses an LLM to perform security and license reviews.

    Parameters
    ----------
    llm_fn:
        A callable ``(prompt: str) -> str`` that calls the LLM.  If ``None``
        the agent degrades gracefully and returns empty findings.
    cache:
        An optional :class:`ReviewCache` for caching results.
    """

    name = "llm-review"
    version = "0.1.0"
    ruleset_version = "llm-0.1.0"
    ruleset_hash = ""

    def __init__(
        self,
        llm_fn: LLMCallable | None = None,
        cache: ReviewCache | None = None,
    ) -> None:
        self._llm_fn = llm_fn
        self._cache = cache

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

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _review_file(self, diff_file: DiffFile) -> list[Finding]:
        """Run security review on a single file."""
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
        prompt = build_security_review_prompt(
            code=clean_code,
            file_path=diff_file.path,
            language=diff_file.language,
        )
        prompt = truncate_to_budget(prompt)

        # 4. Call LLM
        try:
            response_text = self._llm_fn(prompt)
        except Exception:
            logger.exception("LLM call failed for file %s", diff_file.path)
            return []

        # 5. Parse response
        findings = parse_llm_findings(
            response_text=response_text,
            file_path=diff_file.path,
            review_type="security",
        )

        # 6. Cache result
        self._sync_cache_set(content_hash, findings)

        return findings

    def _sync_cache_get(self, content_hash: str) -> list[Finding] | None:
        """Synchronous cache lookup (wraps async cache if present)."""
        if self._cache is None:
            return None
        try:
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_running():
                # If we're already in an async context, skip cache
                return None
            return loop.run_until_complete(self._cache.get(content_hash))
        except RuntimeError:
            # No event loop — create one
            return asyncio.run(self._cache.get(content_hash))
        except Exception:
            logger.warning("Cache get failed", exc_info=True)
            return None

    def _sync_cache_set(self, content_hash: str, findings: list[Finding]) -> None:
        """Synchronous cache store (wraps async cache if present)."""
        if self._cache is None:
            return
        try:
            import asyncio

            loop = asyncio.get_event_loop()
            if loop.is_running():
                return
            loop.run_until_complete(self._cache.set(content_hash, findings))
        except RuntimeError:
            asyncio.run(self._cache.set(content_hash, findings))
        except Exception:
            logger.warning("Cache set failed", exc_info=True)
