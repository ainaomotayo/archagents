FROM python:3.12-slim

WORKDIR /app

# Install framework
COPY ../framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install ip-license agent
COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY sentinel_license/ sentinel_license/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8081
EXPOSE 8081

CMD ["python", "-m", "sentinel_license"]
