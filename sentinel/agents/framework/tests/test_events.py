from __future__ import annotations

import json
from unittest.mock import MagicMock

from sentinel_agents.events import RedisEventProducer


def test_producer_publishes_to_stream():
    mock_redis = MagicMock()
    mock_redis.xadd.return_value = b"1709942400000-0"

    producer = RedisEventProducer(mock_redis)
    msg_id = producer.publish("sentinel.findings", {"scanId": "scan_123", "findings": []})

    assert msg_id == "1709942400000-0"
    mock_redis.xadd.assert_called_once()
    call_args = mock_redis.xadd.call_args
    assert call_args[0][0] == "sentinel.findings"
    data = json.loads(call_args[0][1]["data"])
    assert data["scanId"] == "scan_123"


def test_producer_serializes_as_json():
    mock_redis = MagicMock()
    mock_redis.xadd.return_value = b"123-0"

    producer = RedisEventProducer(mock_redis)
    producer.publish("test.stream", {"key": "value", "nested": {"a": 1}})

    call_args = mock_redis.xadd.call_args
    data = json.loads(call_args[0][1]["data"])
    assert data["key"] == "value"
    assert data["nested"]["a"] == 1
