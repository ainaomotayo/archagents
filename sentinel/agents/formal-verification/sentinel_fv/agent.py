"""Formal verification agent — full pipeline."""
from __future__ import annotations

import asyncio
import logging

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, DiffFile, Finding, extract_added_code

from sentinel_fv.abstract_interp import AbstractInterpreter
from sentinel_fv.config import FVConfig
from sentinel_fv.finding_builder import build_finding
from sentinel_fv.frontend import PythonFrontend
from sentinel_fv.smt_bridge import SMTBridge
from sentinel_fv.types import VerificationResult

logger = logging.getLogger(__name__)


class FormalVerificationAgent(BaseAgent):
    name = "formal-verification"
    version = "0.1.0"
    ruleset_version = "rules-2026.03.15-a"
    ruleset_hash = "sha256:fv-v1"

    def __init__(self) -> None:
        self._frontends = [PythonFrontend()]
        self._ai = AbstractInterpreter()
        self._config = FVConfig()

    def process(self, event: DiffEvent) -> list[Finding]:
        findings: list[Finding] = []
        for diff_file in event.files:
            findings.extend(self._process_file(diff_file))
        return findings

    def _process_file(self, diff_file: DiffFile) -> list[Finding]:
        frontend = next(
            (fe for fe in self._frontends if fe.supports(diff_file.path)), None
        )
        if not frontend:
            return []

        source = extract_added_code(diff_file)
        if not source.strip():
            return []

        changed_lines: set[int] = set()
        for hunk in diff_file.hunks:
            for i in range(hunk.new_count):
                changed_lines.add(hunk.new_start + i)

        result = frontend.analyze(
            diff_file.path,
            source,
            changed_lines=changed_lines,
            smt_timeout_ms=self._config.engine.smt_timeout_ms,
        )
        if not result.vcs:
            return []

        # Stage 1: Abstract interpretation
        undecided_vcs = []
        findings: list[Finding] = []
        for vc in result.vcs:
            ai_result = self._ai.check(vc)
            if ai_result.status == "undecided":
                undecided_vcs.append(vc)
            elif ai_result.status == "violated":
                f = build_finding(vc, ai_result)
                if f:
                    findings.append(f)

        # Stage 2: SMT for undecided VCs
        if undecided_vcs:
            smt_results = self._run_smt(undecided_vcs)
            for vc, smt_result in zip(undecided_vcs, smt_results):
                f = build_finding(vc, smt_result)
                if f:
                    findings.append(f)

        return findings

    def _run_smt(self, vcs: list) -> list[VerificationResult]:
        bridge = SMTBridge(
            pool_size=self._config.engine.pool_size,
            timeout_ms=self._config.engine.smt_timeout_ms,
        )
        try:
            loop = asyncio.new_event_loop()
            results = loop.run_until_complete(bridge.verify_batch(vcs))
            loop.close()
            return results
        finally:
            bridge.shutdown()
