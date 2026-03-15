"""Multi-agent scan orchestrator with two-pass correlation."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from sentinel_agents.base import BaseAgent
from sentinel_agents.types import DiffEvent, Finding, FindingEvent

logger = logging.getLogger(__name__)


@dataclass
class ScanResult:
    """Result of a full orchestrated scan."""

    scan_id: str
    findings: list[dict[str, Any]]
    enriched_findings: list[Any] = field(default_factory=list)
    agent_results: list[FindingEvent] = field(default_factory=list)
    duration_ms: int = 0
    status: str = "completed"
    error_detail: str | None = None


class ScanOrchestrator:
    """Coordinates multi-agent scans with two-pass correlation and SSE streaming."""

    def __init__(
        self,
        agents: list[BaseAgent],
        correlation_engine: Any | None = None,
        sse_publisher: Any | None = None,
        llm_agent: BaseAgent | None = None,
    ) -> None:
        self._agents = agents
        self._correlation = correlation_engine
        self._sse = sse_publisher
        self._llm_agent = llm_agent

    async def run_scan(self, event: DiffEvent) -> ScanResult:
        """Execute full two-pass scan pipeline."""
        start = time.monotonic()
        scan_id = event.scan_id

        # Notify scan start
        await self._emit_progress(scan_id, "pass1", 0, len(self._agents), 0)

        # Pass 1: Run all agents in parallel
        agent_results = await self._run_pass1(event)

        # Collect all findings
        all_findings: list[dict[str, Any]] = []
        for result in agent_results:
            for f in result.findings:
                all_findings.append(f.to_dict())

        await self._emit_progress(
            scan_id, "pass1_complete", len(self._agents), len(self._agents), len(all_findings)
        )

        # Pass 2: Correlate + Enrich
        enriched = all_findings
        if self._correlation and all_findings:
            try:
                enriched_objs = self._correlation.correlate(all_findings, scan_id)
                enriched = all_findings  # Keep originals, enrichment is on the objects
                await self._emit_progress(
                    scan_id, "pass2_complete", len(self._agents), len(self._agents), len(all_findings)
                )
            except Exception as exc:
                logger.warning("Correlation failed for scan %s: %s", scan_id, exc)
                enriched_objs = []
        else:
            enriched_objs = []

        # Pass 2b: LLM escalation for flagged findings
        if self._llm_agent and enriched_objs:
            escalated = [e for e in enriched_objs if getattr(e, "escalate_to_llm", False)]
            if escalated:
                try:
                    llm_result = self._llm_agent.run_scan(event)
                    agent_results.append(llm_result)
                    for f in llm_result.findings:
                        all_findings.append(f.to_dict())
                except Exception as exc:
                    logger.warning("LLM escalation failed for scan %s: %s", scan_id, exc)

        duration_ms = int((time.monotonic() - start) * 1000)

        # Determine overall status
        statuses = [r.status for r in agent_results]
        if all(s == "error" for s in statuses):
            overall_status = "error"
        elif any(s == "error" for s in statuses):
            overall_status = "partial"
        else:
            overall_status = "completed"

        # Emit completion
        await self._emit_completed(scan_id, len(all_findings), len(enriched_objs))

        return ScanResult(
            scan_id=scan_id,
            findings=all_findings,
            enriched_findings=enriched_objs,
            agent_results=agent_results,
            duration_ms=duration_ms,
            status=overall_status,
        )

    async def _run_pass1(self, event: DiffEvent) -> list[FindingEvent]:
        """Run all agents in parallel, collect results."""
        tasks = []
        for agent in self._agents:
            tasks.append(self._run_single_agent(agent, event))
        results = await asyncio.gather(*tasks, return_exceptions=True)

        agent_results: list[FindingEvent] = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(
                    "Agent %s raised exception: %s",
                    self._agents[i].name,
                    result,
                )
                agent_results.append(
                    FindingEvent(
                        scan_id=event.scan_id,
                        agent_name=self._agents[i].name,
                        findings=[],
                        agent_version=self._agents[i].version,
                        ruleset_version=self._agents[i].ruleset_version,
                        ruleset_hash=self._agents[i].ruleset_hash,
                        status="error",
                        duration_ms=0,
                        error_detail=str(result),
                    )
                )
            else:
                agent_results.append(result)

            # Emit per-agent SSE events
            await self._emit_agent_completed(
                event.scan_id,
                self._agents[i].name,
                agent_results[-1],
            )

        return agent_results

    async def _run_single_agent(
        self, agent: BaseAgent, event: DiffEvent
    ) -> FindingEvent:
        """Run a single agent (in executor to avoid blocking)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, agent.run_scan, event)

    async def _emit_progress(
        self, scan_id: str, phase: str, agents_done: int, agents_total: int, findings: int
    ) -> None:
        if not self._sse:
            return
        try:
            from agent_core.streaming.types import EventType, StreamEvent

            await self._sse.publish(
                scan_id,
                StreamEvent(
                    event_type=EventType.SCAN_PROGRESS,
                    data={
                        "phase": phase,
                        "agents_done": agents_done,
                        "agents_total": agents_total,
                        "findings": findings,
                    },
                ),
            )
        except Exception as exc:
            logger.debug("SSE emit failed: %s", exc)

    async def _emit_agent_completed(
        self, scan_id: str, agent_name: str, result: FindingEvent
    ) -> None:
        if not self._sse:
            return
        try:
            from agent_core.streaming.types import EventType, StreamEvent

            await self._sse.publish(
                scan_id,
                StreamEvent(
                    event_type=EventType.AGENT_COMPLETED,
                    data={
                        "agent": agent_name,
                        "status": result.status,
                        "finding_count": len(result.findings),
                        "duration_ms": result.duration_ms,
                    },
                ),
            )
        except Exception as exc:
            logger.debug("SSE emit failed: %s", exc)

    async def _emit_completed(
        self, scan_id: str, total_findings: int, enriched_count: int
    ) -> None:
        if not self._sse:
            return
        try:
            await self._sse.publish_scan_completed(
                scan_id,
                {
                    "total_findings": total_findings,
                    "enriched": enriched_count,
                },
            )
        except Exception as exc:
            logger.debug("SSE emit failed: %s", exc)
