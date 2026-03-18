FROM python:3.12-slim

WORKDIR /app

# Install core first (framework depends on sentinel-agent-core)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install ai-detector agent
COPY agents/ai-detector/pyproject.toml /tmp/ai-detector/pyproject.toml
COPY agents/ai-detector/sentinel_aidetector/ /tmp/ai-detector/sentinel_aidetector/
RUN pip install --no-cache-dir /tmp/ai-detector/ && cp -r /tmp/ai-detector/sentinel_aidetector /app/sentinel_aidetector && rm -rf /tmp/ai-detector/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8086
EXPOSE 8086

CMD ["python", "-m", "sentinel_aidetector"]
