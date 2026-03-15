FROM python:3.12-slim

WORKDIR /app

# Install agent core (tree-sitter AST fingerprinting)
COPY agents/core/ /tmp/core/
RUN pip install --no-cache-dir /tmp/core/ && rm -rf /tmp/core/

# Install framework
COPY agents/framework/ /tmp/framework/
RUN pip install --no-cache-dir /tmp/framework/ && rm -rf /tmp/framework/

# Install ip-license agent
COPY agents/ip-license/pyproject.toml /tmp/ip-license/pyproject.toml
COPY agents/ip-license/sentinel_license/ /tmp/ip-license/sentinel_license/
COPY agents/ip-license/data/ /tmp/ip-license/data/
RUN pip install --no-cache-dir /tmp/ip-license/ \
    && cp -r /tmp/ip-license/sentinel_license /app/sentinel_license \
    && cp -r /tmp/ip-license/data /app/data \
    && rm -rf /tmp/ip-license/

ENV REDIS_URL=redis://redis:6379
ENV HEALTH_PORT=8081
EXPOSE 8081

CMD ["python", "-m", "sentinel_license"]
