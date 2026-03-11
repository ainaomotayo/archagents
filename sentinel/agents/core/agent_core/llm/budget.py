"""Token budget manager with priority-based allocation."""

from __future__ import annotations

from dataclasses import dataclass


# Priority order: higher priority sections are preserved first
SECTION_PRIORITY = {
    "system": 0,
    "code": 1,
    "context": 2,
    "history": 3,
}


@dataclass
class BudgetAllocation:
    sections: dict[str, str]
    total_tokens: int
    truncated: list[str]


class TokenBudget:
    """Manages token allocation across prompt sections."""

    def __init__(self, chars_per_token: float = 4.0) -> None:
        self._chars_per_token = chars_per_token

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return max(1, int(len(text) / self._chars_per_token))

    def allocate(
        self,
        sections: dict[str, str],
        max_tokens: int,
    ) -> BudgetAllocation:
        if not sections:
            return BudgetAllocation(sections={}, total_tokens=0, truncated=[])

        # Calculate current tokens per section
        section_tokens = {
            name: self.estimate_tokens(text) for name, text in sections.items()
        }
        total = sum(section_tokens.values())

        if total <= max_tokens:
            return BudgetAllocation(
                sections=dict(sections),
                total_tokens=total,
                truncated=[],
            )

        # Need to truncate — start with lowest priority
        sorted_sections = sorted(
            sections.keys(),
            key=lambda s: SECTION_PRIORITY.get(s, 99),
            reverse=True,  # lowest priority first
        )

        result = dict(sections)
        truncated: list[str] = []
        remaining = total

        for name in sorted_sections:
            if remaining <= max_tokens:
                break
            current_tokens = section_tokens[name]
            excess = remaining - max_tokens

            if excess >= current_tokens:
                # Remove entire section
                result[name] = ""
                remaining -= current_tokens
                truncated.append(name)
            else:
                # Partial truncation
                keep_tokens = current_tokens - excess
                keep_chars = int(keep_tokens * self._chars_per_token)
                result[name] = result[name][:keep_chars]
                remaining -= excess
                truncated.append(name)

        final_tokens = sum(
            self.estimate_tokens(t) for t in result.values()
        )
        return BudgetAllocation(
            sections=result,
            total_tokens=final_tokens,
            truncated=truncated,
        )
