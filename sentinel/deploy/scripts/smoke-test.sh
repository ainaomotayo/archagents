#!/bin/bash
set -euo pipefail
BASE_URL="${1:?Usage: smoke-test.sh <base-url>}"

echo "=== Sentinel Smoke Tests ==="

echo -n "API health... "
curl -sf "${BASE_URL}/health" > /dev/null && echo "PASS" || { echo "FAIL"; exit 1; }

echo -n "API metrics... "
curl -sf "${BASE_URL}/metrics" | grep -q "sentinel_api" && echo "PASS" || { echo "FAIL"; exit 1; }

echo -n "Dashboard... "
DASH="${BASE_URL%%/v1*}"
curl -sf "${DASH}/" -o /dev/null && echo "PASS" || echo "WARN (may not be accessible from this URL)"

for agent in security dependency; do
  echo -n "Agent ${agent}... "
  STATUS=$(curl -sf "${BASE_URL}/v1/agents/${agent}/health" -o /dev/null -w "%{http_code}" 2>/dev/null || echo "503")
  [ "$STATUS" = "200" ] && echo "PASS" || echo "WARN (${STATUS})"
done

echo ""
echo "=== Smoke tests complete ==="
