FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY sentinel_agents/ sentinel_agents/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8081

EXPOSE 8081

# Agents override CMD to run their specific entry point
CMD ["python", "-m", "sentinel_agents"]
