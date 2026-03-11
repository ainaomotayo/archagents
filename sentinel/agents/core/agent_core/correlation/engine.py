"""Two-pass correlation engine with data-driven rules."""

from __future__ import annotations

import logging
from typing import Any

from .types import CorrelationRule, EnrichedFinding

logger = logging.getLogger(__name__)

# Severity ordering for amplification
_SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]


def _amplify_severity(current: str, levels: int) -> str:
    """Increase severity by N levels, capped at critical."""
    idx = _SEVERITY_ORDER.index(current.lower()) if current.lower() in _SEVERITY_ORDER else 0
    new_idx = min(idx + levels, len(_SEVERITY_ORDER) - 1)
    return _SEVERITY_ORDER[new_idx]


def _lines_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    """Check if two line ranges overlap."""
    return max(a_start, b_start) <= min(a_end, b_end)


# Built-in correlation rules from the design doc
BUILTIN_RULES: list[CorrelationRule] = [
    CorrelationRule(
        name="ai_generated_vulnerability",
        when={"agents": ["ai-detector", "security"], "same_file": True, "line_overlap": True},
        then={"amplify_severity": 1, "add_tag": "ai-generated-vuln", "escalate_to_llm": True},
    ),
    CorrelationRule(
        name="complex_vulnerable_code",
        when={"agents": ["quality", "security"], "same_file": True},
        then={"amplify_severity": 1, "add_tag": "complex-vuln", "add_recommendation": "refactor-before-fix"},
    ),
    CorrelationRule(
        name="copyleft_with_cve",
        when={"agents": ["ip-license", "dependency"], "same_dependency": True},
        then={"severity": "critical", "add_tag": "copyleft-cve", "escalate_to_llm": True},
    ),
    CorrelationRule(
        name="policy_compound",
        when={"agents": ["policy", "*"], "same_file": True},
        then={"amplify_severity": 1, "add_tag": "policy-compound"},
    ),
]


class CorrelationEngine:
    """Correlates findings from multiple agents using data-driven rules."""

    def __init__(self) -> None:
        self._rules: list[CorrelationRule] = list(BUILTIN_RULES)

    def add_rule(self, rule: CorrelationRule) -> None:
        self._rules.append(rule)

    def correlate(
        self,
        findings: list[dict[str, Any]],
        scan_id: str = "",
    ) -> list[EnrichedFinding]:
        """Apply correlation rules to a set of findings from all agents."""
        enriched = [EnrichedFinding.from_finding_dict(f) for f in findings]

        # Group by agent type
        by_agent: dict[str, list[tuple[int, EnrichedFinding]]] = {}
        for i, ef in enumerate(enriched):
            agent = ef.type  # type field maps to agent name
            by_agent.setdefault(agent, []).append((i, ef))

        # Apply each rule
        for rule in self._rules:
            self._apply_rule(rule, enriched, by_agent)

        return enriched

    def _apply_rule(
        self,
        rule: CorrelationRule,
        enriched: list[EnrichedFinding],
        by_agent: dict[str, list[tuple[int, EnrichedFinding]]],
    ) -> None:
        agents_needed = rule.when.get("agents", [])
        if len(agents_needed) < 2:
            return

        agent_a_name = agents_needed[0]
        agent_b_name = agents_needed[1]

        agent_a_findings = by_agent.get(agent_a_name, [])

        # Wildcard: match any other agent
        if agent_b_name == "*":
            agent_b_findings: list[tuple[int, EnrichedFinding]] = []
            for name, items in by_agent.items():
                if name != agent_a_name:
                    agent_b_findings.extend(items)
        else:
            agent_b_findings = by_agent.get(agent_b_name, [])

        if not agent_a_findings or not agent_b_findings:
            return

        same_file = rule.when.get("same_file", False)
        line_overlap = rule.when.get("line_overlap", False)
        same_dependency = rule.when.get("same_dependency", False)

        for idx_a, fa in agent_a_findings:
            for idx_b, fb in agent_b_findings:
                if idx_a == idx_b:
                    continue

                matched = True

                if same_file and fa.file != fb.file:
                    matched = False

                if line_overlap and not _lines_overlap(
                    fa.line_start, fa.line_end, fb.line_start, fb.line_end
                ):
                    matched = False

                if same_dependency:
                    dep_a = fa.extra.get("dependency", "")
                    dep_b = fb.extra.get("dependency", "")
                    if not dep_a or dep_a != dep_b:
                        matched = False

                if matched:
                    self._apply_effects(rule.then, fa, fb)

    def _apply_effects(
        self,
        effects: dict[str, Any],
        finding_a: EnrichedFinding,
        finding_b: EnrichedFinding,
    ) -> None:
        """Apply rule effects to correlated findings."""
        for target in (finding_a, finding_b):
            if "amplify_severity" in effects:
                target.severity = _amplify_severity(
                    target.severity, effects["amplify_severity"]
                )
            if "severity" in effects:
                target.severity = effects["severity"]
            if "add_tag" in effects:
                tag = effects["add_tag"]
                if tag not in target.tags:
                    target.tags.append(tag)
            if "add_recommendation" in effects:
                rec = effects["add_recommendation"]
                if rec not in target.recommendations:
                    target.recommendations.append(rec)
            if effects.get("escalate_to_llm"):
                target.escalate_to_llm = True

            # Track correlation
            other = finding_b if target is finding_a else finding_a
            other_id = f"{other.type}:{other.file}:{other.line_start}"
            if other_id not in target.correlated_with:
                target.correlated_with.append(other_id)
