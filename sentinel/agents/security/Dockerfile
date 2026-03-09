FROM python:3.12-slim

WORKDIR /app

# Install semgrep
RUN pip install --no-cache-dir semgrep

# Install framework
COPY ../framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install security agent
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY sentinel_security/ sentinel_security/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8081
EXPOSE 8081

CMD ["python", "-m", "sentinel_security"]
