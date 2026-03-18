FROM python:3.12-slim

WORKDIR /app

# Install core first (framework depends on sentinel-agent-core)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install dependency agent
COPY agents/dependency/pyproject.toml /tmp/dependency/pyproject.toml
COPY agents/dependency/sentinel_dependency/ /tmp/dependency/sentinel_dependency/
RUN pip install --no-cache-dir /tmp/dependency/ && cp -r /tmp/dependency/sentinel_dependency /app/sentinel_dependency && rm -rf /tmp/dependency/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8083
EXPOSE 8083

CMD ["python", "-m", "sentinel_dependency"]
