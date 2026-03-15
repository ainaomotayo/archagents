# SENTINEL Agent — generic Python agent build
FROM python:3.12-slim
ARG AGENT_NAME
ENV AGENT_NAME=${AGENT_NAME}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY agents/core/ ./core/
COPY agents/framework/ ./framework/
COPY agents/${AGENT_NAME}/ ./agent/
RUN pip install --no-cache-dir ./core ./framework ./agent
# Discover the installed module name from the agent package
RUN AGENT_MODULE=$(find /app/agent -maxdepth 1 -name "sentinel_*" -type d ! -name "*.egg-info" -exec basename {} \; | head -1) \
    && echo "$AGENT_MODULE" > /app/.agent_module
RUN groupadd -g 1001 sentinel && useradd -u 1001 -g sentinel -s /bin/false sentinel \
    && chown -R sentinel:sentinel /app
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${HEALTH_PORT:-8000}/health || exit 1
USER sentinel
CMD ["sh", "-c", "python -m $(cat /app/.agent_module)"]
