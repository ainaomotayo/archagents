FROM python:3.12-slim

WORKDIR /app

# Install core first (framework depends on sentinel-agent-core)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install quality agent
COPY agents/quality/pyproject.toml /tmp/quality/pyproject.toml
COPY agents/quality/sentinel_quality/ /tmp/quality/sentinel_quality/
RUN pip install --no-cache-dir /tmp/quality/ && cp -r /tmp/quality/sentinel_quality /app/sentinel_quality && rm -rf /tmp/quality/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8085
EXPOSE 8085

CMD ["python", "-m", "sentinel_quality"]
