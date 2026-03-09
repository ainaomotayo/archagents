# SENTINEL Agent — generic Python agent build
FROM python:3.12-slim
ARG AGENT_NAME
ENV AGENT_NAME=${AGENT_NAME}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY agents/framework/ ./framework/
COPY agents/${AGENT_NAME}/ ./agent/
RUN pip install --no-cache-dir ./framework ./agent
# Discover the installed module name from the agent package
RUN AGENT_MODULE=$(find /app/agent -maxdepth 1 -name "sentinel_*" -type d ! -name "*.egg-info" -exec basename {} \; | head -1) \
    && echo "$AGENT_MODULE" > /app/.agent_module
CMD ["sh", "-c", "python -m $(cat /app/.agent_module)"]
