# ── Build stage (has gcc, g++, dev headers) ──
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libxml2-dev libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

# Install all Python deps into a virtual env (so we can copy just the venv later)
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir \
    pandas>=2.0 numpy>=1.24 yfinance>=0.2.30 \
    jugaad-data>=0.14 matplotlib>=3.7 mplfinance>=0.12.9b \
    requests>=2.31 python-dateutil>=2.8

# ── Runtime stage (no gcc, no dev headers — just runtime libs) ──
FROM python:3.11-slim AS runtime

# Only runtime shared libs (no gcc/g++/dev headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 libxml2 libxslt1.1 && \
    rm -rf /var/lib/apt/lists/*

# Copy the venv from builder (has all pip packages, no build tools)
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Copy backend app code
COPY backend/ .

# Copy scanner-v3 engine INTO the image
COPY scanner-v3 /scanner-v3

ENV SCANNER_V3_PATH=/scanner-v3
ENV PYTHONPATH=/app:/scanner-v3

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
