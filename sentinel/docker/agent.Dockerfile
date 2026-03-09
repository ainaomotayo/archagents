# SENTINEL Agent — generic Python agent build
FROM python:3.12-slim
ARG AGENT_NAME
ENV AGENT_NAME=${AGENT_NAME}
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY agents/framework/ ./framework/
COPY agents/${AGENT_NAME}/ ./agent/
RUN pip install --no-cache-dir ./framework ./agent
CMD ["sh", "-c", "python -m sentinel_$(echo ${AGENT_NAME} | tr '-' '_')"]
