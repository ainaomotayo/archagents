FROM python:3.12-slim

WORKDIR /app

# Install core first (framework depends on sentinel-agent-core)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install policy agent (includes pyyaml + jsonschema for policy rule parsing)
COPY agents/policy/pyproject.toml /tmp/policy/pyproject.toml
COPY agents/policy/sentinel_policy/ /tmp/policy/sentinel_policy/
RUN pip install --no-cache-dir /tmp/policy/ && cp -r /tmp/policy/sentinel_policy /app/sentinel_policy && rm -rf /tmp/policy/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8088
EXPOSE 8088

CMD ["python", "-m", "sentinel_policy"]
