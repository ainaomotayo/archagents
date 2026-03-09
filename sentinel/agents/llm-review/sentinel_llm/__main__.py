"""Entry point for ``python -m sentinel_llm``.

Runs the LLM Review Agent as a standalone consumer.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from sentinel_agents.types import DiffEvent

from sentinel_llm.agent import LLMReviewAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("sentinel_llm")


def _make_llm_fn(api_key: str | None = None):
    """Create an LLM callable using the Anthropic SDK, or None if unavailable."""
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — LLM review will be disabled")
        return None

    try:
        import anthropic  # noqa: F811
    except ImportError:
        logger.error("anthropic package not installed — LLM review disabled")
        return None

    client = anthropic.Anthropic(api_key=api_key)

    def call_llm(prompt: str) -> str:
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text

    return call_llm


def main() -> None:
    parser = argparse.ArgumentParser(description="SENTINEL LLM Review Agent")
    parser.add_argument("--event-file", help="Path to a JSON DiffEvent file (for testing)")
    parser.add_argument("--api-key", help="Anthropic API key (or set ANTHROPIC_API_KEY env var)")
    args = parser.parse_args()

    import os

    api_key = args.api_key or os.environ.get("ANTHROPIC_API_KEY")
    llm_fn = _make_llm_fn(api_key)
    agent = LLMReviewAgent(llm_fn=llm_fn)

    if args.event_file:
        with open(args.event_file) as f:
            data = json.load(f)
        event = DiffEvent.from_dict(data)
        result = agent.run_scan(event)
        print(json.dumps(result.to_dict(), indent=2))
    else:
        logger.info("LLM Review Agent v%s started (stream mode not yet implemented)", agent.version)
        logger.info("Use --event-file to process a single event for testing")
        sys.exit(0)


if __name__ == "__main__":
    main()
