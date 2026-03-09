FROM python:3.12-slim

WORKDIR /app

# Install framework
COPY ../framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install dependency agent
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY sentinel_dependency/ sentinel_dependency/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8083
EXPOSE 8083

CMD ["python", "-m", "sentinel_dependency"]
