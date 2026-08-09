# Scanner Dashboard — Architecture & Technical Reference

> **Status:** Production. 5/5 Docker containers running, 22 API endpoints passing, login verified from desktop + phone (LAN).
> **GitHub:** https://github.com/karthik0419/scanner-dashboard
> **Owner:** Kartik Bandewar
> **Last updated:** 2026-08-09

This is the flagship project in the workspace — a full-stack SaaS-style web
dashboard that wraps the `scanner-v3` NSE swing-trading pattern screener into a
browser-based product (Screener.in / Trendlyne, but for your own pattern
engine). This document is the **deep technical reference**. For a quick-start
guide, see [README.md](README.md). For debugging history, see
[SESSION_LOG.md](SESSION_LOG.md).

---

## Table of Contents

1. [What it is](#1-what-it-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Docker containers](#3-docker-containers)
4. [Frontend (Next.js 14)](#4-frontend-nextjs-14)
5. [Backend (FastAPI)](#5-backend-fastapi)
6. [Database models](#6-database-models)
7. [API endpoints](#7-api-endpoints)
8. [Scanner integration](#8-scanner-integration)
9. [How a scan runs (end-to-end)](#9-how-a-scan-runs-end-to-end)
10. [Two scanners integrated](#10-two-scanners-integrated)
11. [Deployment options](#11-deployment-options)
12. [Docker image optimization](#12-docker-image-optimization)
13. [Known issues & audit findings](#13-known-issues--audit-findings)
14. [Quick commands](#14-quick-commands)
15. [File inventory](#15-file-inventory)

---

## 1. What it is

A full-stack web application that lets you:

- **Trigger scans** from the browser (7 one-click presets + custom form)
- **View picks** in a filterable, sortable table (pattern, timeframe, status, sector, score, R:R)
- **View charts** (daily/weekly/monthly) for any pick
- **Save screen presets** (reusable filter combinations)
- **Track paper trades** (synced from scanner-v3's `paper_tracker.csv`)
- **Monitor market regime** (Nifty vs 200DMA, sector rotation heatmap)
- **Set price/breakout alerts** (Telegram channel)
- **Run PEAD scans** (Post-Earnings Announcement Drift scanner)

Built on scanner-v3 — the proven swing engine with +1.30% expectancy/trade,
40.6% win rate, 3:1 R:R over 3012 backtested trades (v3.1, 2.0x ATR).

---

## 2. Architecture at a glance

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────────┐
│  Phone/PC   │     │  Next.js 14  │     │  FastAPI  │     │  PostgreSQL  │
│  Browser    │────▶│  (port 3001) │────▶│  (8000)   │────▶│  (port 5433) │
│             │     │  /api proxy  │     │           │     │              │
└─────────────┘     └──────────────┘     └─────┬─────┘     └──────────────┘
                                               │
                                        ┌──────▼──────┐
                                        │   Redis     │
                                        │  (port 6380)│
                                        └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │ arq Worker  │
                                        │             │
                                        │  runs as    │
                                        │ subprocess: │
                                        │ scanner.py  │──▶ results/*.csv
                                        └─────────────┘
```

**Request flow:**
- Browser → Next.js (port 3001) → `/api/*` proxy (baked into `routes-manifest.json` at build time, destination `http://backend:8000`) → FastAPI → PostgreSQL
- Scan execution: FastAPI → Redis queue → arq worker → `scanner.py` subprocess → CSV → parsed into PostgreSQL → frontend polls for completion

**Key design decisions:**
- **Next.js `rewrites()` proxy** — browser uses relative `/api/*` paths (works from any device: desktop, phone, LAN). The Next.js server proxies to `http://backend:8000` server-side. See [SESSION_LOG.md](SESSION_LOG.md) for the build-time baking gotcha.
- **Subprocess isolation** — scanner-v3 runs as a subprocess (not imported), so scanner crashes don't take down the API and there's no global state leakage.
- **arq async jobs** — scans are CPU-heavy (5-55 min), so they run on a worker via Redis queue, not in the API process.

---

## 3. Docker containers

5 containers, all with health checks, memory limits, and `restart: unless-stopped`.

| Container | Image | Port | Memory limit | Health check | Purpose |
|---|---|---|---|---|---|
| `postgres` | postgres:16-alpine | 5433→5432 | 512 MB | `pg_isready -U scanner` | Database — scans, picks, users, alerts, tracker |
| `redis` | redis:7-alpine | 6380→6379 | 128 MB | `redis-cli ping` | Task queue (arq jobs) |
| `backend` | scanner-dashboard-backend | 8000 | 512 MB | `GET /api/health` | FastAPI REST API (22 endpoints) |
| `worker` | scanner-dashboard-worker | — | 1 GB | `python -c "import arq"` | arq worker — runs `scanner.py` as subprocess |
| `frontend` | scanner-dashboard-frontend | 3001→3000 | 256 MB | `node http.get('/landing')` | Next.js 14 dashboard UI |

**Port choices:** Postgres on 5433 (not 5432) and Redis on 6380 (not 6379) to avoid conflicts with the `tableflow` project running on the same PC.

**Volumes:** `pgdata` (DB persistence), `scanner_data` (scan results CSVs), `scanner_cache` (8-hour TTL disk cache), `pead_data` (PEAD scan results).

---

## 4. Frontend (Next.js 14)

**Stack:** Next.js 14.2.5 (App Router, standalone output), React 18, TypeScript, Tailwind CSS, Lucide icons, Recharts, Sonner toasts.

### Pages (13 routes)

| Route | File | Lines | Purpose |
|---|---|---|---|
| `/` | `app/page.tsx` | 20 | Redirects: logged-in → `/dashboard`, logged-out → `/landing` |
| `/landing` | `app/landing/page.tsx` | 181 | Marketing page — hero, features, pricing (Free/Pro), CTA |
| `/login` | `app/login/page.tsx` | 86 | Email/password login + "Try as Guest" button (guest/guest) |
| `/register` | `app/register/page.tsx` | 68 | Sign-up form (name, email, password min 6 chars) |
| `/dashboard` | `app/dashboard/layout.tsx` | 192 | Protected layout — collapsible sidebar, mobile nav drawer, user section, logout |
| `/dashboard` | `app/dashboard/page.tsx` | 177 | Overview — recent scans, market regime, sector heatmap, tracker summary |
| `/dashboard/scans` | `app/dashboard/scans/page.tsx` | 437 | 7 one-click presets + custom scan form + scan history + kill button |
| `/dashboard/scans/[id]` | `app/dashboard/scans/[id]/page.tsx` | 522 | Picks table — filtering (pattern/timeframe/status/sector), sorting, chart viewer, save-as-screen |
| `/dashboard/pead` | `app/dashboard/pead/page.tsx` | 486 | PEAD scanner — 4 presets (Weekly, Daily, Discovery, High Conviction), picks table |
| `/dashboard/screens` | `app/dashboard/screens/page.tsx` | 411 | Saved screen CRUD — create, edit, delete, apply filters to any scan |
| `/dashboard/tracker` | `app/dashboard/tracker/page.tsx` | 388 | Paper trades — entry signals, win/loss stats, sync from scanner-v3 CSV |
| `/dashboard/market` | `app/dashboard/market/page.tsx` | 282 | Sector rotation heatmap, market regime (Nifty vs 200DMA), sorting |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | 518 | User profile, price/breakout alerts, Telegram chat ID setup |

### Reusable UI components (6)

| Component | File | Lines | Purpose |
|---|---|---|---|
| `Button` | `components/ui/Button.tsx` | 54 | 5 variants (primary/secondary/outline/ghost/danger), 3 sizes, loading spinner |
| `Input` | `components/ui/Input.tsx` | 46 | Input, Label, Select with Tailwind styling |
| `Card` | `components/ui/Card.tsx` | 44 | Card, CardHeader, StatCard for consistent layouts |
| `Badge` | `components/ui/Badge.tsx` | 42 | Color-coded status badges (BREAKOUT/NEAR/WATCH, sector signals, scan/trade statuses) |
| `States` | `components/ui/States.tsx` | 44 | Skeleton, TableSkeleton, EmptyState, LoadingState |
| `Instructions` | `components/ui/Instructions.tsx` | 113 | Collapsible help banner with dismiss/restore, localStorage persistence |

### Lib (3 files)

| File | Lines | Purpose |
|---|---|---|
| `lib/api.ts` | 278 | Typed API client — wraps `fetch` with JWT auto-attach, 401 → redirect to `/login`, all endpoints (auth, scans, picks, charts, screens, alerts, tracker, market, PEAD) + TypeScript interfaces for every entity |
| `lib/auth.tsx` | 53 | React Context — `login()`, `register()`, `logout()`, token in `localStorage`, auto-fetches `/api/auth/me` on mount |
| `lib/utils.ts` | 35 | `cn()` (clsx + tailwind-merge), `fmt()` (numbers), `fmtPct()`, `fmtDate()` (IST timezone), `fmtDuration()` |

### Design system

`tailwind.config.ts` (76 lines) defines a custom light theme:
- **Colors:** `bg-base` (white), `accent` (indigo), `text-primary/secondary/tertiary`, `border`, semantic colors (success/warning/danger)
- **Fonts:** Inter (sans), JetBrains Mono (code/numbers)
- **Shadows:** `shadow-pop`, `shadow-glow` (custom elevations)
- **Animations:** `fade-in`, `slide-up`, `pulse-soft`

### Frontend dependencies

| Package | Purpose |
|---|---|
| `next@14.2.5` | Framework (App Router, standalone output, rewrites proxy) |
| `react@18.3.1` | UI library |
| `lucide-react` | Icons |
| `clsx` + `tailwind-merge` | Conditional class composition |
| `recharts` | Charts (market data, tracker P&L) |
| `sonner` | Toast notifications |

---

## 5. Backend (FastAPI)

**Stack:** Python 3.11, FastAPI, SQLAlchemy, arq, PostgreSQL (psycopg2), Redis, JWT (python-jose), bcrypt, pandas, matplotlib, yfinance, jugaad-data.

### Core files

| File | Lines | Purpose |
|---|---|---|
| `app/main.py` | 102 | FastAPI entry — lifespan (create tables, inline migrations, guest user creation), CORS middleware, 9 routers registered, `/api/health` |
| `app/config.py` | 52 | Pydantic settings — `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` (7 days), `SCANNER_V3_PATH`, `PEAD_SCANNER_PATH`, `CORS_ORIGINS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `app/database.py` | 18 | SQLAlchemy engine + connection pool, `SessionLocal`, `Base` declarative base, `get_db()` dependency |
| `app/auth.py` | 36 | JWT create/decode (HS256), bcrypt hash/verify (truncates to 72 bytes — bcrypt limit) |
| `app/deps.py` | 33 | `get_current_user()` — validates JWT via `OAuth2PasswordBearer`, queries User from DB |
| `app/models.py` | 231 | 8 SQLAlchemy ORM models (see [Database models](#6-database-models)) |
| `app/schemas.py` | 270 | Pydantic request/response schemas + validation (see below) |

### Pydantic schemas (key ones)

| Schema | Validation |
|---|---|
| `UserCreate` | email, name (1-100 chars), password (6-128 chars) |
| `UserLogin` | email (str, not EmailStr — allows "guest"), password |
| `ScanTrigger` | top (1-200), min_score (0-100), sl_mode (atr/original), min_price, max_price, stocks_file, bearish, timeframe (all/daily/weekly/monthly), smart, test_mode, scan_name (max 100) |
| `PickFilter` | pattern, timeframe, status, sector, min_score, min_rr, sort_by (score/rr/upside_pct/symbol/risk_pct), sort_desc, limit (1-500), offset |
| `AlertCreate` | symbol, alert_type (price_above/price_below/breakout/pattern), condition_value, channel (telegram/email) |
| `PeadScanTrigger` | mode (weekly/daily/discovery), top (1-200), min_score (0-100), sector |
| `SectorHeat` | sector, perf_5d, perf_20d, signal, score_bonus |
| `MarketRegime` | status (RISK_ON/RISK_OFF), close, dma200, pct_from_dma |

### Services (2 files)

| File | Purpose |
|---|---|
| `app/services/scanner_service.py` | `build_scan_command()` — constructs CLI: `python scanner.py --top N --min-score X --sl-mode atr --workers 8 --no-notify --no-sync [args]`. `run_scan_subprocess()` — executes with 60-min timeout, captures stdout/stderr, parses output CSV via pandas, returns picks. `generate_chart()` — runs `gen_charts.py` for daily/weekly/monthly charts. |
| `app/services/worker.py` | arq worker — `run_scan_job()` and `run_pead_scan_job()`: updates scan status, runs subprocess, stores PID (for cancellation), parses CSV, inserts Pick records into DB. `max_jobs=1` (scans are CPU-heavy), `job_timeout=3900s` (65 min). |

### Backend dependencies (20 packages)

| Package | Purpose |
|---|---|
| `fastapi` + `uvicorn` | Web framework + ASGI server |
| `sqlalchemy` + `psycopg2-binary` | ORM + PostgreSQL driver |
| `pydantic-settings` | Env-based config |
| `python-jose` | JWT tokens |
| `bcrypt` | Password hashing |
| `arq` + `redis` | Async task queue |
| `pandas` + `numpy` | CSV parsing, data manipulation |
| `matplotlib` | Chart generation |
| `yfinance` + `jugaad-data` | NSE market data (with fallback) |
| `ta` + `pandas-ta` | Technical analysis indicators |
| `tabulate` | Pretty-print tables |
| `httpx` | HTTP client (screener.in fetch for PEAD) |
| `python-multipart` | Form data parsing |
| `requests` | HTTP requests |

---

## 6. Database models

8 SQLAlchemy ORM models in `app/models.py` (231 lines).

### User
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| email | String | Unique index |
| name | String | |
| hashed_password | String | bcrypt |
| is_active | Boolean | Default True |
| plan | String | "free" or "pro" |
| telegram_chat_id | String | Nullable |
| created_at | DateTime | Auto |
| → saved_screens, alerts | Relationship | One-to-many |

### Scan
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| user_id | String FK | → User |
| status | String | queued / running / completed / failed / cancelled |
| process_pid | Integer | Nullable — for kill/cancel |
| scan_name | String(100) | User-defined or preset name |
| top, min_score | Integer | Scan parameters |
| sl_mode | String | "atr" or "original" |
| min_price, max_price | Float | Nullable price range filter |
| stocks_file | String | e.g. "backbone50.txt", "nifty500.txt" |
| bearish, smart, test_mode | Boolean | Scan flags |
| timeframe | String | all / daily / weekly / monthly |
| total_picks | Integer | Filled after completion |
| csv_path | String | Path to results CSV |
| error_message | String | Nullable |
| created_at, started_at, completed_at | DateTime | Timestamps |
| duration_seconds | Integer | Computed |
| → picks | Relationship | One-to-many |

### Pick
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| scan_id | String FK | → Scan |
| symbol | String | e.g. "TATAPOWER.NS" |
| pattern | String | Cup & Handle, Double Bottom, etc. |
| timeframe | String | Daily / Weekly / Monthly |
| status | String | BREAKOUT / NEAR / WATCH |
| cmp | Float | Current market price |
| breakout, stop_loss, target_1, target_2 | Float | Price levels |
| upside_pct, risk_pct, rr | Float | Metrics |
| volume | Float | |
| sector, sector_signal | String | Sector classification |
| score | Float | Pattern score (0-100) |
| atr | Float | ATR value |
| → scan | Relationship | Many-to-one |

### PeadScan
Same structure as Scan but with `mode` (weekly/daily/discovery) and `sector` fields instead of the swing-scan parameters.

### PeadPick
| Field | Type | Notes |
|---|---|---|
| symbol, sector, status, mode | String | Status: ENTER NOW / WATCH |
| days_since_result, days_to_result | Integer | Earnings timing |
| last_quarter, result_date | String | e.g. "Q4 FY26" |
| cmp, entry, stop, target, rr | Float | Price levels |
| last_net_profit, last_eps | Float | Last quarter actuals |
| proj_profit, proj_eps, proj_yoy_growth | Float | Projections |
| proj_confidence | String | Projection confidence level |
| avg_spike_pct, consistency_score | Float | Historical post-earnings behavior |
| avg_yoy_growth, growth_quarters | Float/Int | Growth track record |
| sector_rank, score | Integer/Float | Ranking |

### SavedScreen
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| user_id | String FK | → User |
| name, description | String | User-defined |
| filters | JSON | PickFilter dict (pattern, timeframe, min_score, etc.) |
| created_at, updated_at | DateTime | |

### Alert
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| user_id | String FK | → User |
| symbol | String | |
| alert_type | String | price_above / price_below / breakout / pattern |
| condition_value | Float | Nullable — price threshold |
| channel | String | telegram / email |
| is_active | Boolean | Default True |
| triggered | Boolean | Default False |
| triggered_at | DateTime | Nullable |

### PaperTrade
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| user_id | String FK | → User |
| symbol, pattern | String | |
| status_at_scan | String | BREAKOUT / NEAR / WATCH |
| breakout_level, entry_price, stop_loss | Float | |
| target_1, target_2 | Float | |
| scan_date | String | Date of the scan that found this pick |
| cmp_at_scan | Float | Price at scan time |
| current_price | Float | Updated on sync |
| current_status | String | OPEN / WIN_T1 / WIN_T2 / LOSS / RE_ENTERED / TIME_EXIT / WAITING_BREAKOUT |
| current_pnl_pct | Float | |
| days_held | Integer | |
| exit_price, exit_date, exit_reason | Float/String | Nullable |
| tradeable | String | Yes / No |

---

## 7. API endpoints

22 endpoints across 9 routers. Full Swagger docs at `http://localhost:8000/docs`.

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create account (201) |
| POST | `/login` | Login, returns JWT + user |
| GET | `/me` | Current user (requires Bearer token) |

### Scans (`/api/scans`)
| Method | Path | Description |
|---|---|---|
| POST | `/trigger` | Trigger async scan (enqueues arq job) |
| GET | `/` | List scans (limit/offset) |
| GET | `/{id}` | Scan detail |
| POST | `/{id}/cancel` | Kill scanner subprocess via PID |
| GET | `/health/worker` | Check if arq worker is alive (via Redis) |

### Picks (`/api/picks`)
| Method | Path | Description |
|---|---|---|
| GET | `/scan/{scan_id}` | List picks with filters (pattern, timeframe, status, sector, min_score, min_rr, sort) |
| GET | `/{pick_id}` | Single pick |
| GET | `/scan/{scan_id}/stats` | Aggregate stats (by pattern, timeframe, status, sector, avg score/RR) |

### Charts (`/api/charts`)
| Method | Path | Description |
|---|---|---|
| GET | `/{symbol}` | Serve cached chart image (or generate if missing) |
| POST | `/{symbol}/generate` | Force-generate daily/weekly/monthly charts |

### Screens (`/api/screens`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List saved screens |
| POST | `/` | Create saved screen |
| GET | `/{id}` | Get saved screen |
| PUT | `/{id}` | Update saved screen |
| DELETE | `/{id}` | Delete saved screen |
| POST | `/{id}/run` | Apply saved screen filters to a scan |

### Alerts (`/api/alerts`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List alerts |
| POST | `/` | Create alert |
| DELETE | `/{id}` | Delete alert |
| PUT | `/{id}/toggle` | Enable/disable alert |

### Tracker (`/api/tracker`)
| Method | Path | Description |
|---|---|---|
| GET | `/` | List paper trades (filter by status, scan_date) |
| GET | `/dates` | Scan dates with stats (total, open, wins, losses, avg P&L) |
| GET | `/summary` | Tracker summary (total, by status, win rate, avg P&L) |
| POST | `/sync` | Sync from scanner-v3 `paper_tracker.csv` |

### Market (`/api/market`)
| Method | Path | Description |
|---|---|---|
| GET | `/sectors` | Sector rotation heatmap (perf_5d, perf_20d, signal, score_bonus) |
| GET | `/regime` | Market regime — Nifty vs 200DMA (RISK_ON / RISK_OFF) |
| GET | `/hot-sectors` | Top N performing sectors |

### PEAD (`/api/pead`)
| Method | Path | Description |
|---|---|---|
| POST | `/trigger` | Trigger PEAD scan (enqueues arq job) |
| GET | `/` | List PEAD scans |
| GET | `/{id}` | PEAD scan detail |
| POST | `/{id}/cancel` | Kill PEAD scanner subprocess |
| GET | `/{id}/picks` | List PEAD picks with filters |

### Health
| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | `{"status": "ok", "version": "1.0.0"}` |

---

## 8. Scanner integration

### How the backend invokes scanner-v3

**Location:** `backend/app/services/scanner_service.py`

The backend runs scanner-v3 as a **subprocess** (not imported as a module) to:
1. Keep scanner-v3 untouched (no refactoring risk)
2. Provide process isolation (scanner crashes don't kill the API, no global state leaks, no memory growth in the API process)

**Key functions:**
- `build_scan_command()` — constructs CLI: `python scanner.py --top N --min-score X --sl-mode atr --workers 8 --no-notify --no-sync [additional args]`
- `run_scan_subprocess()` — executes subprocess with 60-min timeout, captures stdout/stderr, parses output CSV using pandas, returns picks dict
- `generate_chart()` — runs `gen_charts.py {symbol}` to generate daily/weekly/monthly charts

**Path resolution:** `_scanner_dir()` resolves `SCANNER_V3_PATH` from config:
- Local dev: `../../scanner-v3` (relative to `backend/`)
- Docker: `/scanner-v3` (baked into image)

### How the worker runs scans

**Location:** `backend/app/services/worker.py`

```
1. User triggers scan via POST /api/scans/trigger
2. Backend creates Scan record (status=queued), enqueues arq job to Redis
3. Worker picks up job from Redis queue
4. run_scan_job():
   a. Updates scan status → running, records started_at
   b. Calls run_scan_subprocess() with callback to store PID (for cancellation)
   c. scanner.py scans NSE stocks, writes results/v3_*.csv
   d. Worker reads CSV with pandas, inserts Pick rows into PostgreSQL
   e. Updates scan status → completed, records duration
5. On cancel: POST /api/scans/{id}/cancel → reads process_pid → taskkill /F /PID
6. On error: updates status → failed, stores error_message
```

**Worker configuration:**
- `max_jobs = 1` — scans are CPU-heavy, one at a time
- `job_timeout = 3900` — 65 min (full NSE scans take 45-55 min)

### scanner-v3 files referenced

| File | Purpose |
|---|---|
| `scanner.py` | Main scanner script (executed as subprocess) |
| `gen_charts.py` | Chart generation script |
| `results/v3_*.csv` | Output CSV files (pattern: `v3_*.csv` or `v3_bearish_*.csv`) |
| `results/charts/{timeframe}/{symbol}.png` | Chart image files |
| `results/paper_tracker.csv` | Paper tracker CSV (synced to DB) |
| `utils/sector_rotation_v3.py` | Imported for sector heat data (via sys.path manipulation) |
| `utils/regime.py` | Imported for market regime data |
| `backbone50.txt`, `nifty500.txt`, `nifty200.txt` | Stock universe files |

### PEAD scanner files

| File | Purpose |
|---|---|
| `scanner.py` (in earnings-momentum-scanner) | PEAD scanner script |
| `results/scanner_*.csv` | PEAD output CSV |

---

## 9. How a scan runs (end-to-end)

```
1. User clicks "Smart Daily" preset in browser
   ↓
2. Next.js POSTs to /api/scans/trigger
   (browser → /api/ proxy → http://backend:8000)
   ↓
3. Backend:
   - Validates JWT (get_current_user)
   - Creates Scan row in PostgreSQL (status=queued)
   - Enqueues arq job to Redis: "run_scan_job", scan_id, params
   - Returns scan_id to frontend
   ↓
4. Frontend polls GET /api/scans/{id} every 5s
   ↓
5. arq Worker picks up job from Redis:
   a. Updates Scan status → running, records started_at
   b. Stores subprocess PID in Scan.process_pid
   c. Runs: python scanner.py --top 15 --min-score 40 --sl-mode atr --workers 8 --no-notify --no-sync
   d. scanner.py fetches NSE data (jugaad-data + yfinance fallback)
   e. Scans Backbone 50 + Nifty 500 + hot sector stocks
   f. Detects patterns (C&H, Double Bottom, Darvas, Flags, Breakout, etc.)
   g. Scores each pick (pattern + sector + volume + R:R)
   h. Writes results to results/v3_*.csv
   ↓
6. Worker:
   - Reads CSV with pandas
   - Inserts Pick rows into PostgreSQL (linked to Scan)
   - Updates Scan status → completed, records duration_seconds
   ↓
7. Frontend sees "completed" → loads picks table
   - User filters by pattern/timeframe/sector/status
   - Sorts by score/RR/upside/risk
   - Clicks a pick → chart viewer (daily/weekly/monthly)
   - Saves current filters as a Saved Screen
```

**Cancellation flow:** `POST /api/scans/{id}/cancel` → backend reads `process_pid` from DB → `taskkill /F /PID` (kills subprocess without killing the worker).

---

## 10. Two scanners integrated

| Scanner | Config var | Default path | What it does |
|---|---|---|---|
| **scanner-v3** | `SCANNER_V3_PATH` | `../../scanner-v3` (dev) / `/scanner-v3` (Docker) | Swing trading patterns — Cup & Handle, Double Bottom, Darvas Box, Flags, Breakout, Retest, Compression, Wedge, Triangle, Channel, S&R. Multi-timeframe (D/W/M). Sector rotation. 2.0x ATR stops, 8% stop cap, re-entry after whipsaw. |
| **earnings-momentum-scanner** | `PEAD_SCANNER_PATH` | `../../earnings-momentum-scanner` (dev) / `/earnings-momentum-scanner` (Docker) | PEAD — Post-Earnings Announcement Drift. Scans screener.in for earnings setups, projects EPS/profit growth, ranks by consistency. 4 modes: Weekly, Daily, Discovery, High Conviction. |

Both run as **subprocesses** for process isolation. Both are baked into the Docker image at build time (production) or volume-mounted (dev).

---

## 11. Deployment options

Documented in `deploy/DEPLOYMENT.md` (258 lines).

| Option | Stack | Cost | Use case |
|---|---|---|---|
| **A: Supabase + Vercel + Upstash** | Supabase (Postgres free), Vercel (Next.js free), Upstash (Redis free), EC2/Railway (backend+worker) | Free tiers | Hobby / testing |
| **B: AWS ECS Fargate** | RDS (Postgres), ElastiCache (Redis), ECS (backend/worker/frontend) | ~$50-100/mo | Production scale |
| **C: Single EC2/VPS** | Everything on one box with Docker Compose | ~$10/mo | Simplest |

**Deploy artifacts:**
- `deploy/aws/deploy.sh` — AWS deployment script
- `deploy/aws/ecs-task-definition.json` — ECS task definition
- `deploy/supabase/schema.sql` — Supabase SQL schema
- `deploy/supabase/.env.supabase.example` — Supabase env template
- `docker-compose.production.yml` — Production compose (bakes scanner-v3 into image, no volume mounts)

---

## 12. Docker image optimization

Multi-stage builds + Next.js standalone output mode.

| Image | Before | After | Reduction | How |
|---|---|---|---|---|
| Frontend | 709 MB | 224 MB | 68% | Next.js standalone (minimal server, no node_modules in runtime), multi-stage |
| Backend/Worker | 1.15 GB | 784 MB | 32% | Multi-stage (venv copied from builder, no gcc/g++/dev headers in runtime) |
| **Total** | 3.0 GB | 1.79 GB | **40%** | |

All 5 containers have health checks, memory limits, and `restart: unless-stopped`.

---

## 13. Known issues & audit findings

From `AUDIT_FINDINGS.md` (pre-sale audit, 2026-08-09):

| Severity | Issue | Recommendation |
|---|---|---|
| CRITICAL | No LICENSE file | Add MIT/Apache 2.0/commercial before selling |
| CRITICAL | JWT_SECRET hardcoded fallback | Add startup validation to fail if not set |
| CRITICAL | Docker COPY paths reference scanner-v3 dirs | Embed as git submodule or document as external |
| CRITICAL | Guest user backdoor (guest/guest) | Make opt-in via env var or remove |
| CRITICAL | Unpinned Python deps (`>=` ranges) | Pin to `==` for reproducible builds |
| HIGH | Weak password policy (6 chars min) | Increase to 8+ |
| HIGH | `print()` instead of logging | Use Python `logging` module |
| HIGH | Weak DB password ("scanner") | Use stronger default or require env var |
| HIGH | No unit tests | Add pytest for routers + services |
| LOW | No Alembic migrations | Replace `Base.metadata.create_all` with Alembic |
| LOW | No rate limiting | Add slowapi or similar |
| LOW | AWS deploy scripts are placeholders | Complete or remove |

**What's good:** Clean FastAPI architecture, SQLAlchemy ORM, Next.js 14 + TypeScript, multi-stage Docker, comprehensive docs, health checks, `.env` gitignored, CORS configurable, JWT auth, subprocess isolation.

---

## 14. Quick commands

```powershell
cd F:\projects\claude\scanner-dashboard

# ── Docker ──
docker compose up -d              # Start all 5 containers
docker compose down               # Stop all 5 containers
docker compose restart            # Restart all containers
docker compose ps                 # See running containers + health
docker compose logs -f backend    # Watch backend logs
docker compose logs -f worker     # Watch worker logs
docker compose logs -f frontend   # Watch frontend logs
docker compose build frontend     # Rebuild frontend after code changes
docker compose up -d --build      # Rebuild + restart everything

# Or double-click start-all.bat

# ── Access ──
# Dashboard:  http://localhost:3001/login
# Swagger:    http://localhost:8000/docs
# From phone: http://192.168.1.10:3001/login (same WiFi)

# ── Login ──
# kartik@scanner.io / kartik  (or register, or guest / guest)

# ── Tests ──
cd backend && python test_api.py  # Tests all 22 endpoints
```

---

## 15. File inventory

### Frontend
```
frontend/
├── app/
│   ├── layout.tsx              # Root layout (AuthProvider, Toaster)
│   ├── page.tsx                # Home (redirect)
│   ├── globals.css             # Tailwind + fonts + scrollbar
│   ├── landing/page.tsx        # Marketing page
│   ├── login/page.tsx          # Login form + guest
│   ├── register/page.tsx       # Registration form
│   └── dashboard/
│       ├── layout.tsx          # Sidebar + mobile nav
│       ├── page.tsx            # Overview
│       ├── scans/
│       │   ├── page.tsx        # Scan presets + trigger + history
│       │   └── [id]/page.tsx   # Picks table + filters + charts
│       ├── pead/page.tsx       # PEAD scanner
│       ├── screens/page.tsx    # Saved screens CRUD
│       ├── tracker/page.tsx    # Paper tracker
│       ├── market/page.tsx     # Sector heat + regime
│       └── settings/page.tsx   # Profile + alerts + Telegram
├── components/ui/
│   ├── Button.tsx              # 5 variants, loading state
│   ├── Input.tsx               # Input, Label, Select
│   ├── Card.tsx                # Card, CardHeader, StatCard
│   ├── Badge.tsx               # Status badges
│   ├── States.tsx              # Skeleton, EmptyState, LoadingState
│   └── Instructions.tsx        # Collapsible help banner
├── lib/
│   ├── api.ts                  # Typed API client (all endpoints)
│   ├── auth.tsx                # Auth context (login/register/logout)
│   └── utils.ts                # cn, fmt, fmtPct, fmtDate, fmtDuration
├── public/                     # Static assets
├── next.config.js              # Rewrites proxy (/api → backend:8000)
├── tailwind.config.ts          # Light theme design system
├── package.json                # Next.js 14, React 18, Tailwind, Recharts
├── tsconfig.json
└── Dockerfile                  # Multi-stage (builder + runtime)
```

### Backend
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI entry, lifespan, CORS, routers
│   ├── config.py               # Pydantic settings (env-based)
│   ├── database.py             # SQLAlchemy engine + SessionLocal
│   ├── auth.py                 # JWT + bcrypt
│   ├── deps.py                 # get_current_user
│   ├── models.py               # 8 SQLAlchemy models (231 lines)
│   ├── schemas.py              # Pydantic schemas + validation (270 lines)
│   ├── routers/
│   │   ├── auth.py             # register, login, me
│   │   ├── scans.py            # trigger, list, detail, cancel, worker health
│   │   ├── picks.py            # list (filtered), detail, stats
│   │   ├── charts.py           # serve, generate
│   │   ├── screens.py          # CRUD + run
│   │   ├── alerts.py           # CRUD + toggle
│   │   ├── tracker.py          # list, dates, summary, sync
│   │   ├── market.py           # sectors, regime, hot-sectors
│   │   └── pead.py             # trigger, list, detail, cancel, picks
│   └── services/
│       ├── scanner_service.py  # Subprocess runner, CSV parser, chart gen
│       └── worker.py           # arq worker (run_scan_job, run_pead_scan_job)
├── requirements.txt            # 20 Python packages
├── Dockerfile                  # Multi-stage (builder + runtime)
├── Dockerfile.production       # Production (bakes scanner-v3 in)
├── .env / .env.example
└── test_api.py                 # 22-endpoint test suite
```

### Root
```
scanner-dashboard/
├── backend/                    # (above)
├── frontend/                   # (above)
├── deploy/
│   ├── DEPLOYMENT.md           # 3 deployment guides (258 lines)
│   ├── aws/
│   │   ├── deploy.sh
│   │   └── ecs-task-definition.json
│   └── supabase/
│       ├── schema.sql
│       └── .env.supabase.example
├── scanner-v3/                 # Embedded scanner-v3 (for Docker build)
├── earnings-momentum-scanner/  # Embedded PEAD scanner (for Docker build)
├── docker-compose.yml          # Dev: 5 containers with volume mounts
├── docker-compose.production.yml  # Prod: scanner-v3 baked into images
├── .env.example
├── .gitignore
├── start-all.bat               # One-click Docker Compose startup
├── README.md                   # Quick-start guide
├── ARCHITECTURE.md             # This file — deep technical reference
├── SESSION_LOG.md              # Debugging session history
├── AUDIT_FINDINGS.md           # Pre-sale audit (issues + recommendations)
└── COMMIT_MSG.txt              # (stale — safe to delete)
```

---

## Legal note

This is a **screener tool** (like Screener.in/Trendlyne), NOT a SEBI-registered
advisory product. It surfaces chart patterns and setups — it does NOT provide
buy/sell recommendations. Do not market it as advisory without SEBI RA
registration.
