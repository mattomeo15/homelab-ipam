FROM python:3.11-slim

WORKDIR /app

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000

# Install system network utilities + curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    net-tools \
    iputils-ping \
    iproute2 \
    dnsutils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    aiohttp \
    jinja2 \
    pydantic

# Create persistent data directory
RUN mkdir -p /app/backend/data

# Copy backend application code
COPY backend/app /app/backend/app

# Copy frontend assets and templates
COPY frontend/public /app/frontend/public
COPY frontend/templates /app/frontend/templates

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

VOLUME ["/app/backend/data"]

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]