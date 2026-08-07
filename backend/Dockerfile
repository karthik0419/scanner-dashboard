FROM python:3.11-slim

WORKDIR /app

# System deps for matplotlib + psycopg2 + scanner-v3 (jugaad-data needs libxml2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ libpq-dev libxml2-dev libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

# Install backend deps (path is relative to build context = scanner-dashboard root)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-install scanner-v3 deps (so scanner.py works as subprocess)
RUN pip install --no-cache-dir \
    pandas>=2.0 numpy>=1.24 yfinance>=0.2.30 \
    jugaad-data>=0.14 matplotlib>=3.7 mplfinance>=0.12.9b \
    requests>=2.31 python-dateutil>=2.8

# Copy backend app code
COPY backend/ .

# Copy scanner-v3 engine INTO the image (no external mount needed)
COPY scanner-v3 /scanner-v3

ENV SCANNER_V3_PATH=/scanner-v3
ENV PYTHONPATH=/app:/scanner-v3

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
