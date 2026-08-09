# Scanner Dashboard — Session Log

Running log of debugging/feature sessions on the scanner-dashboard project.
Append newest entries to the top.

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
