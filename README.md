# Scanner Dashboard

A production web application wrapping [scanner-v3](../scanner-v3) — the NSE swing setup pattern screener — as a Screener.in/Trendlyne-style SaaS dashboard.

## Architecture

```
scanner-dashboard/
├── backend/              # FastAPI + SQLAlchemy + PostgreSQL + arq (Redis)
│   ├── app/
│   │   ├── main.py       # FastAPI app
│   │   ├── config.py     # Env-based settings
│   │   ├── database.py   # SQLAlchemy engine
│   │   ├── models.py     # User, Scan, Pick, SavedScreen, Alert, PaperTrade
│   │   ├── schemas.py    # Pydantic validation
│   │   ├── auth.py       # JWT + bcrypt
│   │   ├── deps.py       # FastAPI dependencies
│   │   ├── routers/      # auth, scans, picks, charts, screens, alerts, tracker, market
│   │   └── services/
│   │       ├── scanner_service.py  # Runs scanner.py as subprocess, parses CSV
│   │       └── worker.py           # arq worker for async scan jobs
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/             # Next.js 14 (App Router) + Tailwind + shadcn-style UI
│   ├── app/
│   │   ├── login/        # Auth pages
│   │   ├── register/
│   │   └── dashboard/    # Protected pages (overview, scans, screens, tracker, market, settings)
│   ├── lib/              # API client, auth context, utils
│   ├── components/ui/    # Button, Input, Card, Badge
│   └── Dockerfile
├── docker-compose.yml    # postgres + redis + backend + worker + frontend
└── .env.example
```

## Features

- **JWT auth** — register, login, protected routes
- **Async scan execution** — trigger scans from UI, runs via arq worker (Redis queue), 5-15 min
- **Picks table** — filter by pattern, timeframe, status, sector, score, R:R; sortable
- **Chart viewer** — click any pick to see daily/weekly/monthly charts
- **Saved screens** — save filter presets, reuse across scans
- **Paper tracker** — sync paper trades from scanner-v3, view win/loss stats
- **Market data** — sector rotation heatmap, market regime (Nifty vs 200DMA)
- **Price alerts** — set price_above/price_below/breakout alerts
- **Dark theme** — clean, professional UI

## Quick Start (Docker)

```bash
# 1. Copy env
cp .env.example .env
# Edit .env — set JWT_SECRET to a random string

# 2. Start all services
docker-compose up --build

# 3. Access
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000/docs (Swagger)
```

## Quick Start (Local Dev)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start Postgres + Redis (via Docker or local install)
docker run -d -p 5432:5432 -e POSTGRES_USER=scanner -e POSTGRES_PASSWORD=scanner -e POSTGRES_DB=scanner_dashboard postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# Copy env
cp .env.example .env

# Run API
uvicorn app.main:app --reload --port 8000

# In another terminal — run worker
arq app.services.worker.WorkerSettings
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## How Scans Work

1. User clicks "New Scan" → sets parameters (top, min_score, sl_mode, price range, etc.)
2. POST `/api/scans/trigger` → creates Scan record (status=queued) → enqueues arq job
3. Worker picks up job → runs `python scanner.py --top N --min-score X ...` as subprocess in scanner-v3/
4. Worker parses output CSV → inserts Pick records → updates Scan status to completed
5. Frontend polls scan status every 5s → shows picks table when completed

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| POST | `/api/scans/trigger` | Trigger async scan |
| GET | `/api/scans` | List scans |
| GET | `/api/scans/{id}` | Scan detail |
| GET | `/api/picks/scan/{id}` | List picks (with filters) |
| GET | `/api/picks/scan/{id}/stats` | Scan aggregate stats |
| GET | `/api/charts/{symbol}` | Get chart image |
| POST | `/api/charts/{symbol}/generate` | Force-generate charts |
| GET | `/api/screens` | List saved screens |
| POST | `/api/screens` | Create saved screen |
| DELETE | `/api/screens/{id}` | Delete saved screen |
| GET | `/api/alerts` | List alerts |
| POST | `/api/alerts` | Create alert |
| DELETE | `/api/alerts/{id}` | Delete alert |
| GET | `/api/tracker` | List paper trades |
| GET | `/api/tracker/summary` | Tracker stats |
| POST | `/api/tracker/sync` | Sync from scanner-v3 CSV |
| GET | `/api/market/sectors` | Sector rotation heatmap |
| GET | `/api/market/regime` | Market regime (Nifty vs 200DMA) |
| GET | `/api/health` | Health check |

## Legal Note

This is a **screener tool** (like Screener.in/Trendlyne), NOT a SEBI-registered advisory product. It surfaces chart patterns and setups — it does NOT provide buy/sell recommendations. Do not market it as advisory without SEBI RA registration.

## Deployment

See **[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md)** for full deployment guides:

- **Supabase + Vercel + Upstash** (free tiers, simplest)
- **AWS ECS Fargate** (production scale)
- **Single EC2/VPS** (simplest, ~$10/mo)

### Production Docker (bakes scanner-v3 into image)

```bash
# From scanner-dashboard/ root (must have scanner-v3/ as sibling)
docker-compose -f docker-compose.production.yml up -d --build
```

### Test Results

All 22 API endpoints tested and passing:
- Auth (register, login, me)
- Scans (trigger, list, detail)
- Picks (list with filters, stats)
- Saved Screens (CRUD)
- Alerts (CRUD)
- Market data (sectors, regime)
- Paper tracker (list, summary, sync)
- Charts (generate, serve)
- OpenAPI docs

Run tests: `cd backend && python test_api.py`
