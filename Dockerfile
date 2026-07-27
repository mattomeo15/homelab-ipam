FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    net-tools \
    iputils-ping \
    iproute2 \
    dnsutils \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    aiohttp \
    jinja2 \
    pydantic

# Create persistent data directory
RUN mkdir -p /data

# Copy application files
COPY main.py .
COPY scanner.py .
COPY exporter.py .
COPY templates/ templates/

VOLUME ["/data"]

EXPOSE 8080

ENV TZ=UTC \
    PUID=0 \
    PGID=0 \
    PORT=8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
