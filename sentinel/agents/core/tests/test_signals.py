"""Tests for agent signal types."""

from agent_core.streaming.signals import AgentSignal


class TestAgentSignal:
    def test_values(self) -> None:
        assert AgentSignal.STARTED.value == "started"
        assert AgentSignal.COMPLETED.value == "completed"
        assert AgentSignal.ERROR.value == "error"
        assert AgentSignal.CANCELLED.value == "cancelled"

    def test_string_comparison(self) -> None:
        assert AgentSignal.STARTED == "started"
        assert AgentSignal.COMPLETED == "completed"

    def test_from_string(self) -> None:
        assert AgentSignal("started") == AgentSignal.STARTED
        assert AgentSignal("error") == AgentSignal.ERROR
