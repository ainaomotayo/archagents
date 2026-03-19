FROM python:3.12-slim

WORKDIR /app

# Install core first (framework depends on sentinel-agent-core)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install Anthropic SDK for LLM calls (gracefully disabled if ANTHROPIC_API_KEY is unset)
RUN pip install --no-cache-dir anthropic

# Install llm-review agent
COPY agents/llm-review/pyproject.toml /tmp/llm-review/pyproject.toml
COPY agents/llm-review/sentinel_llm/ /tmp/llm-review/sentinel_llm/
RUN pip install --no-cache-dir /tmp/llm-review/ && cp -r /tmp/llm-review/sentinel_llm /app/sentinel_llm && rm -rf /tmp/llm-review/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8087
# ANTHROPIC_API_KEY must be injected at runtime — omit to disable LLM review
EXPOSE 8087

CMD ["python", "-m", "sentinel_llm"]
