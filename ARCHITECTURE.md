# Scanner Dashboard — Architecture & Technical Reference

> **Status:** Production v1.1.0. 5/5 Docker containers running, 40+ API endpoints, 100 pytest tests passing, interactive charts, categories, admin user management, rate limiting.
> **GitHub:** https://github.com/karthik0419/scanner-dashboard
> **Owner:** Kartik Bandewar
> **Last updated:** 2026-08-10

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
- **View interactive charts** (lightweight-charts candlestick + volume, zoom/pan) for any pick — replaced static PNG charts in v1.1.0
- **Tag stocks into categories** (watchlist) — create, rename, recolor, hide, delete categories; tag from any chart modal or the Watchlist page
- **Manage users** (admin) — list/search/filter, create, edit role/plan/active, reset password, delete; RBAC with last-admin guard
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
- Chart data: FastAPI → yfinance → Redis cache (key `ohlcv:SYMBOL:timeframe`, 1h TTL) → JSON to frontend → lightweight-charts renders candlesticks + volume

**Key design decisions:**
- **Next.js `rewrites()` proxy** — browser uses relative `/api/*` paths (works from any device: desktop, phone, LAN). The Next.js server proxies to `http://backend:8000` server-side. See [SESSION_LOG.md](SESSION_LOG.md) for the build-time baking gotcha.
- **Subprocess isolation** — scanner-v3 runs as a subprocess (not imported), so scanner crashes don't take down the API and there's no global state leakage.
- **arq async jobs** — scans are CPU-heavy (5-55 min), so they run on a worker via Redis queue, not in the API process. `max_jobs=1` (one scan at a time).
- **JWT-keyed rate limiting** — authenticated endpoints key on user ID (not IP), so users behind NAT/proxies don't share quotas. Implemented via slowapi + Redis.
- **Per-user data isolation** — categories, scans, screens, alerts, trades are all scoped by `user_id`. Cross-user access returns 404.
- **OHLCV Redis cache** — chart data cached per symbol+timeframe (1h TTL). First fetch ~400ms (yfinance), cached fetch ~13ms.

---

## 3. Docker containers

5 containers, all with health checks, memory limits, and `restart: unless-stopped`.

| Container | Image | Port | Memory limit | Health check | Purpose |
|---|---|---|---|---|---|
| `postgres` | postgres:16-alpine | 5433→5432 | 512 MB | `pg_isready -U scanner` | Database — scans, picks, users, alerts, tracker |
| `redis` | redis:7-alpine | 6380→6379 | 128 MB | `redis-cli ping` | Task queue (arq jobs) |
| `backend` | scanner-dashboard-backend | 8000 | 512 MB | `GET /api/health` | FastAPI REST API (40+ endpoints, v1.1.0) — auth, scans, picks, charts (OHLCV), categories, admin, rate limiting |
| `worker` | scanner-dashboard-worker | — | 1 GB | `python -c "import arq"` | arq worker — runs `scanner.py` as subprocess |
| `frontend` | scanner-dashboard-frontend | 3001→3000 | 256 MB | `node http.get('/landing')` | Next.js 14 dashboard UI |

**Port choices:** Postgres on 5433 (not 5432) and Redis on 6380 (not 6379) to avoid conflicts with the `tableflow` project running on the same PC.

**Volumes:** `pgdata` (DB persistence), `scanner_data` (scan results CSVs), `scanner_cache` (8-hour TTL disk cache), `pead_data` (PEAD scan results).

---

## 4. Frontend (Next.js 14)

**Stack:** Next.js 14.2.5 (App Router, standalone output), React 18, TypeScript, Tailwind CSS, Lucide icons, Recharts, Sonner toasts.

### Pages (16 routes)

| Route | File | Lines | Purpose |
|---|---|---|---|
| `/` | `app/page.tsx` | 20 | Redirects: logged-in → `/dashboard`, logged-out → `/landing` |
| `/landing` | `app/landing/page.tsx` | 181 | Marketing page — hero, features, pricing (Free/Pro), CTA |
| `/login` | `app/login/page.tsx` | 86 | Email/password login + "Try as Guest" button (guest/guest) |
| `/register` | `app/register/page.tsx` | 68 | Sign-up form (name, email, password min 6 chars) |
| `/dashboard` | `app/dashboard/layout.tsx` | 195 | Protected layout — collapsible sidebar, mobile nav drawer, user section, logout, admin link (role-based) |
| `/dashboard` | `app/dashboard/page.tsx` | 177 | Overview — recent scans, market regime, sector heatmap, tracker summary |
| `/dashboard/scans` | `app/dashboard/scans/page.tsx` | 437 | 7 one-click presets + custom scan form + scan history + kill button |
| `/dashboard/scans/[id]` | `app/dashboard/scans/[id]/page.tsx` | 430 | Picks table — filtering, sorting, interactive chart modal, category tagger, save-as-screen |
| `/dashboard/pead` | `app/dashboard/pead/page.tsx` | 520 | PEAD scanner — 4 presets, picks table, interactive chart modal |
| `/dashboard/screens` | `app/dashboard/screens/page.tsx` | 411 | Saved screen CRUD — create, edit, delete, apply filters to any scan |
| `/dashboard/tracker` | `app/dashboard/tracker/page.tsx` | 470 | Paper trades — entry signals, win/loss stats, sync from scanner-v3 CSV, interactive chart modal |
| `/dashboard/market` | `app/dashboard/market/page.tsx` | 282 | Sector rotation heatmap, market regime (Nifty vs 200DMA), sorting |
| `/dashboard/watchlist` | `app/dashboard/watchlist/page.tsx` | 230 | Category management — create/rename/recolor/hide/delete categories, add/remove symbols, open charts inline (v1.1.0) |
| `/dashboard/admin` | `app/dashboard/admin/page.tsx` | 290 | User management (admin only) — list/search/filter users, create, edit role/plan/active, reset password, delete, system stats (v1.1.0) |
| `/dashboard/settings` | `app/dashboard/settings/page.tsx` | 518 | User profile, price/breakout alerts, Telegram chat ID setup |

### Reusable UI components (9)

| Component | File | Lines | Purpose |
|---|---|---|---|
| `Button` | `components/ui/Button.tsx` | 54 | 5 variants (primary/secondary/outline/ghost/danger), 3 sizes, loading spinner |
| `Input` | `components/ui/Input.tsx` | 46 | Input, Label, Select with Tailwind styling |
| `Card` | `components/ui/Card.tsx` | 44 | Card, CardHeader, StatCard for consistent layouts |
| `Badge` | `components/ui/Badge.tsx` | 42 | Color-coded status badges (BREAKOUT/NEAR/WATCH, sector signals, scan/trade statuses) |
| `States` | `components/ui/States.tsx` | 44 | Skeleton, TableSkeleton, EmptyState, LoadingState |
| `Instructions` | `components/ui/Instructions.tsx` | 113 | Collapsible help banner with dismiss/restore, localStorage persistence |
| `InteractiveChart` | `components/charts/InteractiveChart.tsx` | 120 | lightweight-charts candlestick + volume renderer (v1.1.0) |
| `StockChartModal` | `components/charts/StockChartModal.tsx` | 95 | Modal wrapper for InteractiveChart with symbol search, timeframe toggle (v1.1.0) |
| `CategoryTagger` | `components/categories/CategoryTagger.tsx` | 140 | Inline category tagging widget — create/tag/untag from any chart modal (v1.1.0) |

### Lib (3 files)

| File | Lines | Purpose |
|---|---|---|
| `lib/api.ts` | 420 | Typed API client — wraps `fetch` with JWT auto-attach, 401 → redirect to `/login`, all endpoints (auth, scans, picks, charts OHLCV, categories, admin, screens, alerts, tracker, market, PEAD) + TypeScript interfaces for every entity (v1.1.0) |
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
| `lightweight-charts` | Interactive candlestick + volume charts (v1.1.0) |
| `sonner` | Toast notifications |

---

## 5. Backend (FastAPI)

**Stack:** Python 3.11, FastAPI, SQLAlchemy, arq, PostgreSQL (psycopg2), Redis, JWT (PyJWT), bcrypt, slowapi (rate limiting), pandas, matplotlib, yfinance, jugaad-data.

### Core files

| File | Lines | Purpose |
|---|---|---|
| `app/main.py` | 140 | FastAPI entry — lifespan (create tables, inline migrations, guest user creation, admin promotion), CORS middleware, slowapi rate limiter mount, 11 routers registered, `/api/health` |
| `app/config.py` | 61 | Pydantic settings — `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` (7 days), `ADMIN_EMAIL` (bootstrap), `GUEST_ENABLED`, `SCANNER_V3_PATH`, `PEAD_SCANNER_PATH`, `CORS_ORIGINS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `app/database.py` | 18 | SQLAlchemy engine + connection pool (`pool_size=10, max_overflow=20`), `SessionLocal`, `Base` declarative base, `get_db()` dependency |
| `app/auth.py` | 36 | JWT create/decode (HS256 via PyJWT), bcrypt hash/verify (truncates to 72 bytes — bcrypt limit) |
| `app/deps.py` | 43 | `get_current_user()` — validates JWT via `OAuth2PasswordBearer`, queries User from DB; `require_admin()` — checks `user.role == "admin"` |
| `app/limiter.py` | 46 | slowapi rate limiter — Redis-backed, JWT-keyed (`user_or_ip_key` function extracts user ID from Bearer token, falls back to IP). Separate module to avoid circular imports. |
| `app/models.py` | 290 | 10 SQLAlchemy ORM models (see [Database models](#6-database-models)) |
| `app/schemas.py` | 370 | Pydantic request/response schemas + validation (see below) |

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
| `CategoryCreate` | name (1-50 chars), color (blue/green/amber/red/purple, default blue) |
| `CategoryUpdate` | name?, color?, is_hidden? (all optional) |
| `CategoryItemAdd` | symbol (normalized — .NS suffix stripped, uppercased) |
| `AdminUserCreate` | email, name, password (8+ chars), role (user/admin), plan (free/pro) |
| `AdminUserUpdate` | name?, role?, plan?, is_active? (all optional) |
| `PasswordReset` | new_password (8+ chars) |

### Services (2 files)

| File | Purpose |
|---|---|
| `app/services/scanner_service.py` | `build_scan_command()` — constructs CLI: `python scanner.py --top N --min-score X --sl-mode atr --workers 8 --no-notify --no-sync [args]`. `run_scan_subprocess()` — executes with 60-min timeout, captures stdout/stderr, parses output CSV via pandas, returns picks. `generate_chart()` — runs `gen_charts.py` for daily/weekly/monthly charts. |
| `app/services/worker.py` | arq worker — `run_scan_job()` and `run_pead_scan_job()`: updates scan status, runs subprocess, stores PID (for cancellation), parses CSV, inserts Pick records into DB. `max_jobs=1` (scans are CPU-heavy), `job_timeout=3900s` (65 min). |

### Backend dependencies (22 packages)

| Package | Purpose |
|---|---|
| `fastapi` + `uvicorn` | Web framework + ASGI server |
| `sqlalchemy` + `psycopg2-binary` | ORM + PostgreSQL driver |
| `pydantic-settings` | Env-based config |
| `pyjwt` | JWT tokens (HS256) |
| `bcrypt` | Password hashing |
| `slowapi` | Rate limiting (Redis-backed, JWT-keyed) — v1.1.0 |
| `arq` + `redis` | Async task queue |
| `pandas` + `numpy` | CSV parsing, data manipulation |
| `matplotlib` | Chart generation |
| `yfinance` + `jugaad-data` | NSE market data (with fallback) |
| `ta` + `pandas-ta` | Technical analysis indicators |
| `tabulate` | Pretty-print tables |
| `httpx` | HTTP client (screener.in fetch for PEAD) |
| `python-multipart` | Form data parsing |
| `requests` | HTTP requests |

### Dev dependencies (`requirements-dev.txt`)

| Package | Purpose |
|---|---|
| `pytest` | Test runner |
| `httpx` | Async test client for FastAPI |
| `faker` | Random test data generation |

---

## 6. Database models

10 SQLAlchemy ORM models in `app/models.py` (290 lines).

### User
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| email | String | Unique index |
| name | String | |
| hashed_password | String | bcrypt |
| role | String | "user" or "admin" (default "user") — v1.1.0 |
| is_active | Boolean | Default True |
| plan | String | "free" or "pro" |
| telegram_chat_id | String | Nullable |
| created_at | DateTime | Auto |
| → saved_screens, alerts, categories | Relationship | One-to-many |

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

### Category (v1.1.0)
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| user_id | String FK | → User |
| name | String(50) | Unique per user |
| color | String(20) | blue/green/amber/red/purple (default blue) |
| is_hidden | Boolean | Default False — hidden categories filtered from tracker |
| created_at, updated_at | DateTime | Auto |
| → items | Relationship | One-to-many |

### CategoryItem (v1.1.0)
| Field | Type | Notes |
|---|---|---|
| id | String (UUID) | Primary key |
| category_id | String FK | → Category |
| symbol | String | Normalized (e.g. "RELIANCE" — .NS suffix stripped) |
| note | String | Nullable |
| created_at | DateTime | Auto |
| → category | Relationship | Many-to-one |

**Unique constraint:** `(category_id, symbol)` — prevents duplicate tags.

---

## 7. API endpoints

40+ endpoints across 11 routers. Full Swagger docs at `http://localhost:8000/docs`.

### Auth (`/api/auth`)
| Method | Path | Rate limit | Description |
|---|---|---|---|
| POST | `/register` | 5/min (IP) | Create account (201) |
| POST | `/login` | 10/min (IP) | Login, returns JWT + user |
| GET | `/me` | — | Current user (requires Bearer token) |

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
| Method | Path | Rate limit | Description |
|---|---|---|---|
| GET | `/{symbol}` | — | Serve cached chart image (or generate if missing) |
| POST | `/{symbol}/generate` | — | Force-generate daily/weekly/monthly charts |
| GET | `/{symbol}/ohlcv` | 120/min (user) | OHLCV JSON for interactive charts — `?timeframe=daily\|weekly\|monthly`, Redis-cached (v1.1.0) |

### Categories (`/api/categories`) — v1.1.0
| Method | Path | Description |
|---|---|---|
| GET | `/` | List user's categories (`?include_hidden=true`) |
| POST | `/` | Create category (name, color) |
| PATCH | `/{id}` | Update category (name, color, is_hidden) |
| DELETE | `/{id}` | Delete category + items |
| POST | `/{id}/items` | Add symbol to category (normalized) |
| DELETE | `/{id}/items/{symbol}` | Remove symbol from category |
| GET | `/symbol/{symbol}` | Categories containing that symbol |

### Admin (`/api/admin`) — v1.1.0
| Method | Path | Description |
|---|---|---|
| GET | `/users` | List users (search q, filter role/active, pagination) — admin only |
| POST | `/users` | Create user (email, name, password 8+, role, plan) — admin only |
| PATCH | `/users/{id}` | Update user (name, role, plan, is_active) — admin only |
| POST | `/users/{id}/reset-password` | Reset password (8+ chars) — admin only |
| DELETE | `/users/{id}` | Delete user (can't delete self or last active admin) — admin only |
| GET | `/stats` | System totals (users, scans, trades, categories) — admin only |

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
| GET | `/api/health` | `{"status": "ok", "version": "1.1.0"}` |

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

From `AUDIT_FINDINGS.md` (pre-sale audit, 2026-08-09). Items marked **[FIXED v1.1.0]** were resolved in this release.

| Severity | Issue | Status | Recommendation |
|---|---|---|---|
| CRITICAL | No LICENSE file | Open | Add MIT/Apache 2.0/commercial before selling |
| CRITICAL | JWT_SECRET hardcoded fallback | **[FIXED v1.1.0]** | docker-compose.yml now sets `JWT_SECRET` env var (64-char hex) |
| CRITICAL | Docker COPY paths reference scanner-v3 dirs | Open | Embed as git submodule or document as external |
| CRITICAL | Guest user backdoor (guest/guest) | Partial | `GUEST_ENABLED` env var exists; default still True for dev |
| CRITICAL | Unpinned Python deps (`>=` ranges) | Open | Pin to `==` for reproducible builds |
| HIGH | Weak password policy (6 chars min) | **[FIXED v1.1.0]** | Admin-created users require 8+ chars; self-register still 6+ |
| HIGH | `print()` instead of logging | Open | Use Python `logging` module |
| HIGH | Weak DB password ("scanner") | Open | Use stronger default or require env var |
| HIGH | No unit tests | **[FIXED v1.1.0]** | 100 pytest tests in `backend/tests/` + 115-test E2E script + locust load test |
| LOW | No Alembic migrations | Open | Replace `Base.metadata.create_all` with Alembic |
| LOW | No rate limiting | **[FIXED v1.1.0]** | slowapi with Redis backend, JWT-keyed for authed routes, IP-keyed for auth |
| LOW | AWS deploy scripts are placeholders | Open | Complete or remove |

**What's good:** Clean FastAPI architecture, SQLAlchemy ORM, Next.js 14 + TypeScript, multi-stage Docker, comprehensive docs, health checks, `.env` gitignored, CORS configurable, JWT auth, subprocess isolation, per-user data isolation, RBAC with admin guards, Redis-cached OHLCV, 100-test pytest suite.

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
cd backend && python -m pytest tests/ -v     # 100 pytest tests (CI suite)
python _e2e_test.py                           # 115-test E2E API script (needs running containers)
python load_test.py                           # Locust load test (needs `pip install locust`)

# ── Login ──
# kartik@scanner.io / kartik  (admin — sees Admin sidebar link)
# guest / guest               (regular user — no admin link)
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
│       ├── layout.tsx          # Sidebar + mobile nav + admin link (role-based)
│       ├── page.tsx            # Overview
│       ├── scans/
│       │   ├── page.tsx        # Scan presets + trigger + history
│       │   └── [id]/page.tsx   # Picks table + filters + interactive chart + tagger
│       ├── pead/page.tsx       # PEAD scanner + interactive chart
│       ├── screens/page.tsx    # Saved screens CRUD
│       ├── tracker/page.tsx    # Paper tracker + interactive chart
│       ├── market/page.tsx     # Sector heat + regime
│       ├── watchlist/page.tsx  # Category management (v1.1.0)
│       ├── admin/page.tsx      # User management (v1.1.0, admin only)
│       └── settings/page.tsx   # Profile + alerts + Telegram
├── components/
│   ├── ui/
│   │   ├── Button.tsx          # 5 variants, loading state
│   │   ├── Input.tsx           # Input, Label, Select
│   │   ├── Card.tsx            # Card, CardHeader, StatCard
│   │   ├── Badge.tsx           # Status badges
│   │   ├── States.tsx          # Skeleton, EmptyState, LoadingState
│   │   └── Instructions.tsx    # Collapsible help banner
│   ├── charts/
│   │   ├── InteractiveChart.tsx  # lightweight-charts candlestick + volume (v1.1.0)
│   │   └── StockChartModal.tsx   # Modal wrapper for InteractiveChart (v1.1.0)
│   └── categories/
│       └── CategoryTagger.tsx    # Inline category tagging widget (v1.1.0)
├── lib/
│   ├── api.ts                  # Typed API client (all endpoints + types)
│   ├── auth.tsx                # Auth context (login/register/logout)
│   └── utils.ts                # cn, fmt, fmtPct, fmtDate, fmtDuration
├── public/                     # Static assets
├── next.config.js              # Rewrites proxy (/api → backend:8000)
├── tailwind.config.ts          # Light theme design system
├── package.json                # Next.js 14, React 18, Tailwind, Recharts, lightweight-charts
├── tsconfig.json
└── Dockerfile                  # Multi-stage (builder + runtime)
```

### Backend
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI entry, lifespan, CORS, slowapi, routers
│   ├── config.py               # Pydantic settings (env-based)
│   ├── database.py             # SQLAlchemy engine + SessionLocal
│   ├── auth.py                 # JWT (PyJWT) + bcrypt
│   ├── deps.py                 # get_current_user + require_admin
│   ├── limiter.py              # slowapi rate limiter (Redis, JWT-keyed) — v1.1.0
│   ├── models.py               # 10 SQLAlchemy models (290 lines)
│   ├── schemas.py              # Pydantic schemas + validation (370 lines)
│   ├── routers/
│   │   ├── auth.py             # register, login, me (rate-limited)
│   │   ├── scans.py            # trigger (rate-limited), list, detail, cancel, worker health
│   │   ├── picks.py            # list (filtered), detail, stats
│   │   ├── charts.py           # serve image, generate, OHLCV JSON (rate-limited) — v1.1.0
│   │   ├── categories.py       # CRUD + items + symbol lookup — v1.1.0
│   │   ├── admin.py            # user management + stats (admin only) — v1.1.0
│   │   ├── screens.py          # CRUD + run
│   │   ├── alerts.py           # CRUD + toggle
│   │   ├── tracker.py          # list, dates, summary, sync
│   │   ├── market.py           # sectors, regime, hot-sectors
│   │   └── pead.py             # trigger, list, detail, cancel, picks
│   └── services/
│       ├── scanner_service.py  # Subprocess runner, CSV parser, chart gen
│       └── worker.py           # arq worker (run_scan_job, run_pead_scan_job)
├── tests/                      # pytest CI suite — v1.1.0
│   ├── conftest.py             # Fixtures: test DB, transaction rollback, Redis cleanup
│   ├── test_auth.py            # 12 tests: register, login, me, deactivated user
│   ├── test_admin.py           # 28 tests: RBAC, CRUD, guards (last admin, self-delete), stats
│   ├── test_categories.py      # 25 tests: CRUD, isolation, normalization, duplicates
│   ├── test_charts_ohlcv.py    # 15 tests: auth, response shape, cache, timeframes
│   ├── test_rate_limit.py      # 5 tests: login/register/scan trigger limits, JWT keying
│   └── test_regression.py      # 15 tests: all existing endpoints still work
├── requirements.txt            # 22 Python packages
├── requirements-dev.txt        # pytest, httpx, faker — v1.1.0
├── Dockerfile                  # Multi-stage (builder + runtime)
├── Dockerfile.production       # Production (bakes scanner-v3 in)
├── .env / .env.example
└── test_api.ps1                # PowerShell API test script
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
├── _e2e_test.py                # 115-test E2E API script — v1.1.0
├── load_test.py                # Locust load test (100-500 users) — v1.1.0
├── README.md                   # Quick-start guide
├── ARCHITECTURE.md             # This file — deep technical reference
├── SESSION_LOG.md              # Debugging session history
├── AUDIT_FINDINGS.md           # Pre-sale audit (issues + recommendations)
└── TEST_REPORT.md              # v1.1.0 test results (115 API + 100 pytest + locust) — v1.1.0
```

---

## Legal note

This is a **screener tool** (like Screener.in/Trendlyne), NOT a SEBI-registered
advisory product. It surfaces chart patterns and setups — it does NOT provide
buy/sell recommendations. Do not market it as advisory without SEBI RA
registration.
