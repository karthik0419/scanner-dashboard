# Scanner Dashboard — Session Log

Running log of debugging/feature sessions on the scanner-dashboard project.
Append newest entries to the top.

---

## 2026-08-21 — Scalability review, SL pattern analysis, Telegram MCP setup

**Goal:** Three separate discussions — (1) AWS deployment plan, (2) scalability
to 1000+ users, (3) portfolio tracker SL re-entry analysis, (4) Telegram MCP
server setup for reading trading chats.

### 1. AWS deployment plan (NOT executed — user said wait)

User asked about hosting on AWS. Provided step-by-step plan for cheapest option
(single EC2 t3.small, ap-south-1 Mumbai, ~$11/mo). All 5 containers on one box
with Nginx reverse proxy + Let's Encrypt. User said "don't start the deployment
wait" — plan is documented but not executed.

### 2. Scalability analysis — can app handle 1000+ users?

**Answer: No, not currently.** Key bottlenecks identified:

| Issue | Current | Needed for 1000+ |
|---|---|---|
| Scan execution | 1 worker, max_jobs=1 (15-55 min/scan) | 3-5 worker replicas + shared scan model |
| DB pool | 30 connections (pool_size=10, overflow=20) | 100+ connections |
| Uvicorn | 1 worker | 4 workers |
| Postgres | 512MB in Docker | RDS managed, 1GB+ |
| Scan model | Each user triggers own scan | Shared daily scan + user filters (like Screener.in) |

**Key recommendation:** Change the scan model from per-user scans to one daily
shared scan (4 AM) with user-side filtering. This eliminates the worker
bottleneck entirely. 1000 users filtering shared results = read-heavy dashboard
that scales easily. Cost: $50-70/mo on ECS + RDS.

### 3. SL pattern analysis (live paper tracker)

Ran analysis on 181 live paper tracker picks. Findings:

| Pattern | Closed | SL | Wins | SL Rate | Win Rate | Avg SL Loss |
|---|---|---|---|---|---|---|
| Cup & Handle | 9 | 8 | 0 | **89%** | 0% | -1.84% |
| Double Bottom | 5 | 2 | 3 | 40% | **60%** | -1.23% |
| C&H (Monthly) | 1 | 0 | 1 | 0% | 100% | — |

**Cup & Handle is the problem — 89% SL rate, 0 wins.** Double Bottom is the
winner (60% win rate). 1 whipsaw found (GENESYS — SL hit at -3.86%, stock later
reached T1 for +17.19% if held).

3 stocks approaching breakout (re-entry watch):
- CASTROLIND (2.5% below breakout) — C&H pattern
- VEDL (4.6% below) — Double Bottom (better re-entry candidate)
- ABCAPITAL (4.8% below) — C&H pattern

**Note:** Initially modified dashboard repo (tracker.py, api.ts, tracker page)
to add re-entry endpoint + UI. User said this was wrong — re-entry logic already
lives in paper_tracker.py for daily scripts/Telegram. **Reverted all dashboard
changes.** Both repos clean.

### 4. Telegram MCP server setup

User wants Telegram chat access to identify stock patterns from trading
chats/groups. Researched Telegram MCP servers:

| Server | Tools | Transport |
|---|---|---|
| mcp-telegram.com (cloud) | 181 | OAuth (Claude.ai/ChatGPT only — won't work with Devin) |
| beautyfree/mcp-telegram | 100+ | stdio (npx — works with Devin) |
| chigwell/telegram-mcp | Full | Python/Telethon |

**Selected:** beautyfree/mcp-telegram (self-hosted, npx, 100+ tools, browser QR
login). Cloud version doesn't work with Devin CLI (uses OAuth, not stdio).

**Configured:** Added to `C:\Users\91814\AppData\Roaming\devin\config.json`:
```json
"mcpServers": {
  "telegram": {
    "command": "npx",
    "args": ["-y", "mcp-telegram"],
    "env": {
      "TELEGRAM_API_ID": "39794048",
      "TELEGRAM_API_HASH": "***"
    }
  }
}
```

User created app at my.telegram.org/apps (title: scanner_dashboard, short name:
scannerIO). Needs Devin restart + QR code scan (Telegram phone app → Settings →
Devices → Link Desktop Device) to complete login. Session saves to
`~/.telegram-agent/`.

**Status:** Config saved, awaiting Devin restart + QR login.

### Files changed this session

- `C:\Users\91814\AppData\Roaming\devin\config.json` — added Telegram MCP server
- No scanner-dashboard or scanner-v3 files changed (all reverted)

### Lessons (reusable)

> Before adding a feature to the dashboard, check if it already exists in the
> daily scripts. The scanner-v3 paper_tracker.py already has re-entry detection
> (auto-checks on `update` command). The dashboard should be a view layer, not
> a duplicate implementation. User's words: "we already have the portfolio
> tracker and SL re-entry mechanisms in our daily scripts for our personal and
> telegram use."

> The cloud version of mcp-telegram.com only works with Claude.ai and ChatGPT
> (OAuth connectors). Devin CLI uses stdio MCP transport — must use the
> self-hosted npx version (beautyfree/mcp-telegram) instead.

> For scaling to 1000+ users, the cheapest path is changing the scan model
> from per-user scans to a shared daily scan with user-side filtering. This
> is how Screener.in and Trendlyne work — one server-side scan, users just
> filter results. Eliminates the worker bottleneck entirely.

---

## 2026-08-10 — v1.1.0: Interactive charts, categories, admin, rate limiting, tests

**Goal:** Add 5 new features for multi-user readiness: interactive charts,
category/tagging system, admin user management, rate limiting, and a full
test suite.

### Features built

1. **Interactive charts (lightweight-charts)**
   - Replaced static PNG chart viewer with candlestick + volume chart
   - New `GET /api/charts/{symbol}/ohlcv?timeframe=daily|weekly|monthly` endpoint
   - Redis-cached (key `ohlcv:SYMBOL:timeframe`, 1h TTL): first fetch ~400ms, cached ~13ms
   - `InteractiveChart.tsx` (candlestick renderer) + `StockChartModal.tsx` (modal wrapper)
   - Wired into scans detail, tracker, and PEAD pages

2. **Category/tagging system**
   - `Category` + `CategoryItem` models (per-user, unique name per user)
   - Full CRUD: create, rename, recolor, hide, delete categories
   - Add/remove symbols (normalized — `.NS` suffix stripped, uppercased)
   - `CategoryTagger.tsx` component embedded in chart modal — tag from anywhere
   - New `/dashboard/watchlist` page for category management
   - Per-user isolation: cross-user access returns 404

3. **Admin user management**
   - `role` column on User model ("user" / "admin")
   - `GET /api/admin/users` (search, filter by role/active, pagination)
   - `POST /api/admin/users` (create with 8+ char password)
   - `PATCH /api/admin/users/{id}` (edit role/plan/active)
   - `POST /api/admin/users/{id}/reset-password`
   - `DELETE /api/admin/users/{id}` (can't delete self or last active admin)
   - `GET /api/admin/stats` (system totals)
   - `require_admin` dependency — 403 for non-admins
   - New `/dashboard/admin` page (sidebar link visible only to admin role)
   - Admin bootstrap: `ADMIN_EMAIL` env var promotes user on startup

4. **Rate limiting (slowapi)**
   - Redis-backed, JWT-keyed (`user_or_ip_key` extracts user ID from Bearer token)
   - Login: 10/min (IP), Register: 5/min (IP), Scan trigger: 10/hour (user), OHLCV: 120/min (user)
   - `limiter.py` separate module to avoid circular imports

5. **Test suite**
   - 115-test E2E API script (`_e2e_test.py`) — all features + edge cases
   - 100-test pytest CI suite (`backend/tests/`) — test DB, transaction rollback
   - Locust load test (`load_test.py`) — 190 requests, p95 < 60ms, cached OHLCV 13ms
   - `TEST_REPORT.md` with full results

### Bugs found and fixed

- **TypeScript build error** — `InstructionsBanner` variant `"indigo"` not in
  allowed union (`"blue" | "green" | "amber"`). Fixed: changed to `"blue"` in
  `watchlist/page.tsx`.
- **Smoke test JSON parse** — `urllib.error.HTTPError.read()` consumed body
  before `json.loads` could parse it. Fixed: read body once into variable.

### Docker rebuilds

- Backend + worker: `--no-cache` rebuild to pick up `slowapi` in requirements.txt
- Frontend: `--no-cache` rebuild to pick up `lightweight-charts` in package.json
- All 5 containers healthy after rebuild

### Test results

| Suite | Result |
|---|---|
| E2E API (`_e2e_test.py`) | 115/115 passed |
| Pytest CI (`backend/tests/`) | 100/100 passed |
| Locust load test | 190 requests, 0 failures, p95 < 60ms |
| Frontend build | 16/16 pages compiled |

### Files changed (37 files, +4611 lines)

**Backend (new):** `limiter.py`, `routers/admin.py`, `routers/categories.py`,
`requirements-dev.txt`, `tests/` (7 files)
**Backend (modified):** `config.py`, `deps.py`, `main.py`, `models.py`,
`routers/auth.py`, `routers/charts.py`, `routers/scans.py`, `schemas.py`,
`requirements.txt`
**Frontend (new):** `app/dashboard/watchlist/page.tsx`, `app/dashboard/admin/page.tsx`,
`components/charts/InteractiveChart.tsx`, `components/charts/StockChartModal.tsx`,
`components/categories/CategoryTagger.tsx`
**Frontend (modified):** `app/dashboard/layout.tsx`, `app/dashboard/pead/page.tsx`,
`app/dashboard/scans/[id]/page.tsx`, `app/dashboard/tracker/page.tsx`, `lib/api.ts`,
`package.json`, `package-lock.json`
**Root (new):** `_e2e_test.py`, `load_test.py`, `TEST_REPORT.md`
**Root (modified):** `.gitignore`

### Commit

`42ff620` — "Add interactive charts, categories, admin user management, rate
limiting, and test suite (v1.1.0)" — pushed to origin/master.

### Capacity analysis

Current config handles ~50-100 concurrent active users (DB pool = 30 connections).
500+ concurrent idle users (logged in, not clicking) are fine. To scale to 500+
active: (1) `uvicorn --workers 4`, (2) `pool_size=20, max_overflow=40`, (3) Postgres
1GB memory. Scan triggers are queued (`max_jobs=1`) — one scan at a time, 15-55 min
each. Multiple users can trigger but they run sequentially.

### Lesson (reusable)

> When adding rate limiting to a FastAPI app with JWT auth, key the limiter by
> user ID (from the Bearer token), not IP. Users behind corporate NAT/proxies
> share IPs — IP-keyed limits would throttle legitimate users. The `user_or_ip_key`
> pattern (try JWT first, fall back to IP for unauthenticated routes like login)
> is the right approach. Put the limiter in a separate module to avoid circular
> imports between `main.py` and routers.

---

## 2026-08-09 — "Frequent disconnects" on phone (dashboard + Swagger UI)

**Symptom (reported):** Frequent disconnections observed on the phone for both
the dashboard UI and Swagger UI. Appeared intermittent — "observing in between".
Later reported as "now working smooth".

**Initial hypothesis:** PC going to sleep → network drops → phone loses access.
User selected "PC sleeping" as the state when disconnects happen.

**Investigation:**
1. `powercfg /a` — PC supports **S3 sleep** (traditional), NOT Modern Standby
   (S0 Low Power Idle). This matters: S3 suspends CPU + freezes Docker; only
   Modern Standby keeps network alive in sleep.
2. `powercfg /getactivescheme` — active plan is **High Performance**
   (GUID `8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`).
3. `powercfg /query SCHEME_CURRENT SUB_SLEEP` — `STANDBYIDLE` (sleep after)
   is `0x00000000` for **both AC and DC** = **Never**. The PC does not sleep
   on its own, plugged in or on battery.
   → The "PC sleeping" hypothesis is wrong; the PC was awake the whole time.
4. WiFi adapter (Intel AX200) advanced properties already optimal:
   - Transmit Power: 5. Highest
   - U-APSD support: Disabled (good — U-APSD causes drops on many routers)
   - Wake on Magic Packet: Enabled
   - Wake on Pattern Match: Enabled
   - MIMO Power Save Mode: Auto SMPS
   → No WiFi power-saving misconfiguration.

**Root cause (actual):** The disconnects were **the same ECONNREFUSED proxy
bug** fixed in the previous session (`ad9bfe9`). Every `/api/*` call (login,
dashboard data, scans, Swagger fetches) was returning HTTP 500 because the
Next.js proxy was baked with `http://localhost:8000` (unreachable inside the
container). On the phone this manifested as:
- Page HTML loads fine (Next.js serves static/cached HTML) → looks "connected"
- Every API call fails with 500 → dashboard appears dead / "disconnected"
- Intermittent feel because some static loads succeed while API calls always
  fail, giving the impression of an unstable connection

After the `ad9bfe9` fix rebuilt the frontend with the correct
`http://backend:8000` rewrite destination, all API calls succeed → "working
smooth" as reported by user.

**Why the "PC sleeping" theory was plausible but wrong:** It's a common mental
model for intermittent network drops, and S3 sleep *would* cause exactly this
symptom — but the PC's sleep timer is set to Never, so it wasn't the factor.

**Action taken:** None. No power or WiFi settings changed (none needed).
- PC sleep: already Never (AC + DC) under High Performance plan.
- WiFi adapter: already optimally configured.
- App: already fixed in `ad9bfe9`.

**Lesson (reusable):**
> "Frequent disconnects" on a web app that loads HTML but fails API calls is
> almost always a proxy/CORS/backend-reachability issue, not a network/sleep
> issue. The intermittent feel comes from static assets succeeding while
> dynamic API calls consistently fail. Before chasing power/WiFi settings,
> check: (1) `docker ps` for container health, (2) browser devtools Network
> tab for 500s on `/api/*`, (3) `docker logs <frontend>` for ECONNREFUSED.
> Also: verify the actual sleep timeout with `powercfg /query SCHEME_CURRENT
> SUB_SLEEP` before assuming sleep is the cause — "High Performance" plans
> often have sleep set to Never already.

**Diagnostic commands for future reference:**
```powershell
# Is the PC actually sleeping? (0 = Never)
powercfg /query SCHEME_CURRENT SUB_SLEEP   # look for STANDBYIDLE AC/DC index
powercfg /getactivescheme                   # which plan is active
powercfg /a                                 # S3 vs Modern Standby (S0)

# Are containers healthy?
docker ps --format "table {{.Names}}\t{{.Status}}"

# Is the proxy reaching the backend? (look for ECONNREFUSED)
docker logs scanner-dashboard-frontend-1 --tail 30

# Test API from phone's path (LAN IP)
Invoke-WebRequest -Uri "http://192.168.1.10:3001/api/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://192.168.1.10:8000/api/health" -UseBasicParsing  # backend direct

# WiFi adapter power settings
Get-NetAdapterAdvancedProperty -Name "Wi-Fi" | Where-Object {$_.DisplayName -match "Power|Wake|U-APSD"}
```

---

## 2026-08-09 — Phone login broken (ECONNREFUSED in frontend proxy)

**Symptom (reported):** Cannot log in from phone (same WiFi as PC). Works on
desktop only.

**Clarification gathered:** scanner-dashboard, accessed from phone on same WiFi
via the PC's LAN IP. Same credentials work on PC but fail on phone.

### Investigation

1. Inspected `docker-compose.yml` + `frontend/next.config.js` + `frontend/Dockerfile`.
   - Frontend uses Next.js `rewrites()` to proxy `/api/:path*` → backend.
   - `next.config.js` resolves the destination as:
     `process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`
2. Checked running containers — all 5 healthy, ports bound `0.0.0.0:3001->3000`.
3. Tested the proxied login endpoint:
   - `POST http://localhost:3001/api/auth/login` → **500**
   - `POST http://192.168.1.10:3001/api/auth/login` → **500**
   - `POST http://localhost:8000/api/auth/login` (backend direct) → **200 OK**
   → Proxy was broken for BOTH desktop and phone; user had only noticed phone.
4. Frontend container logs showed:
   `AggregateError [ECONNREFUSED] ::1:8000` and `127.0.0.1:8000`
   → the Next.js server was trying to reach `localhost:8000` inside the
   container, where no backend exists (backend is on Docker hostname `backend`).
5. Verified env inside the running container:
   `API_URL=http://backend:8000` WAS set, `NEXT_PUBLIC_API_URL=` (empty), and
   the container CAN reach `http://backend:8000/api/health` (200).
6. Inspected `.next/routes-manifest.json`:
   `"destination":"http://localhost:8000/api/:path*"` — **baked at build time**
   with the fallback default, ignoring the runtime `API_URL`.

### Root cause

**Next.js bakes `rewrites()` into `routes-manifest.json` at BUILD time.** The
`rewrites()` function reads `process.env.API_URL`, but during `docker build`
only `NEXT_PUBLIC_API_URL` was passed as a build arg — `API_URL` was never set
in the builder stage. So `next.config.js` fell back to its default
`http://localhost:8000`, which got frozen into the manifest. At runtime the
compose `environment:` sets `API_URL=http://backend:8000`, but that's too late
— the manifest is already baked. Result: every proxied `/api/*` call hit
`localhost:8000` inside the container → `ECONNREFUSED` → 500.

This broke login from ALL devices (desktop included); the phone was just where
it was first noticed.

### Fix

1. **`frontend/Dockerfile`** — added `ARG API_URL=http://backend:8000` +
   `ENV API_URL=$API_URL` in the **builder** stage so `next.config.js` reads it
   during `next build`. Also removed the misleading runtime
   `ENV NEXT_PUBLIC_API_URL=http://localhost:8000` (no-op for the client bundle
   since `NEXT_PUBLIC_*` is inlined at build; it only caused confusion).
2. **`docker-compose.yml`** — added `API_URL: http://backend:8000` to the
   frontend service's `build.args` (explicit, matches the Dockerfile default).

### Verification

- Rebuilt + recreated frontend container.
- `routes-manifest.json` now shows
  `"destination":"http://backend:8000/api/:path*"`.
- `POST localhost:3001/api/auth/login` → **200** (guest / Guest)
- `POST 192.168.1.10:3001/api/auth/login` → **200** (guest / Guest)
- `GET 192.168.1.10:3001/api/auth/me` with bearer token → **200**
- Frontend logs clean, no `ECONNREFUSED`.

### Files changed

- `frontend/Dockerfile` — `ARG API_URL` in builder stage; removed stale runtime
  `NEXT_PUBLIC_API_URL` ENV.
- `docker-compose.yml` — `API_URL` build arg for frontend service.

### Lesson (reusable)

> Next.js `rewrites()` destinations are baked into `routes-manifest.json` at
> **build** time, not runtime. Any env var the `rewrites()` function reads
> (e.g. `API_URL`) must be present as a Docker `ARG`/`ENV` in the **builder**
> stage. Setting it via compose `environment:` at runtime is too late. This is
> the classic "works on desktop, breaks on phone / LAN" trap when the baked
> value is `localhost` — it resolves inside the container to nothing.
