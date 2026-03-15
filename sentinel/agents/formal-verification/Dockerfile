FROM python:3.12-slim

WORKDIR /app

# Install framework first
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install formal-verification agent
COPY agents/formal-verification/pyproject.toml /tmp/fv/pyproject.toml
COPY agents/formal-verification/sentinel_fv/ /tmp/fv/sentinel_fv/
RUN pip install --no-cache-dir /tmp/fv/ && cp -r /tmp/fv/sentinel_fv /app/sentinel_fv && rm -rf /tmp/fv/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8084
EXPOSE 8084

CMD ["python", "-m", "sentinel_fv"]
