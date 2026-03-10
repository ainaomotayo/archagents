FROM python:3.12-slim

WORKDIR /app

# Install semgrep
RUN pip install --no-cache-dir semgrep

# Install framework first
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install security agent
COPY agents/security/pyproject.toml /tmp/security/pyproject.toml
COPY agents/security/sentinel_security/ /tmp/security/sentinel_security/
RUN pip install --no-cache-dir /tmp/security/ && cp -r /tmp/security/sentinel_security /app/sentinel_security && rm -rf /tmp/security/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8081
EXPOSE 8081

CMD ["python", "-m", "sentinel_security"]
