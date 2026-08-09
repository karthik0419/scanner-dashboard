# Scanner Dashboard — Session Log

Running log of debugging/feature sessions on the scanner-dashboard project.
Append newest entries to the top.

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
