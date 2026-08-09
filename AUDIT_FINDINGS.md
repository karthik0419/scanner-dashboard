# Pre-Sale Audit Findings — scanner-dashboard

**Audit date:** 2026-08-09
**Status:** NOT READY TO SELL — fix critical issues before listing

---

## CRITICAL (must fix before selling)

| # | Issue | File | Impact |
|---|---|---|---|
| 1 | No LICENSE file | project root | Can't legally sell without licensing terms |
| 2 | JWT_SECRET hardcoded fallback | `docker-compose.yml` line 53, `docker-compose.production.yml` line 44, `backend/app/config.py` line 21 | If buyer forgets to set it, anyone can forge JWT tokens |
| 3 | Docker builds will FAIL — `COPY scanner-v3` and `COPY earnings-momentum-scanner` reference dirs that don't exist | `backend/Dockerfile` lines 43-46, `backend/Dockerfile.production` line 19 | Buyer runs `docker-compose up --build` -> immediate failure |
| 4 | Guest user backdoor — auto-creates `guest`/`guest` on startup | `backend/app/main.py` lines 24-44 | Default login anyone can use |
| 5 | Python deps not pinned (`>=` instead of `==`) | `backend/requirements.txt` | Buyer's build may pull breaking versions |

## HIGH (should fix)

| # | Issue | File | Impact |
|---|---|---|---|
| 6 | Password minimum only 6 chars | `backend/app/schemas.py` line 11 | Weak for a paid product |
| 7 | `print()` instead of logging | `backend/app/main.py` lines 38,40,42; `backend/app/services/worker.py` lines 131,135 | Not production-grade |
| 8 | Weak default DB password (`scanner`) | `docker-compose.yml` line 7 | Easy to guess |
| 9 | No unit tests — only integration test script | `backend/test_api.py` | Hard to verify for buyer |
| 10 | No frontend tests | `frontend/` | — |

## LOW (nice to have)

- No Alembic migrations (uses `Base.metadata.create_all`)
- No rate limiting on API
- AWS deploy script has placeholder values (documented but not automated)
- No request logging / monitoring

---

## What's already good (no changes needed)

- Clean FastAPI architecture (9 routers, proper async job queue with arq/Redis)
- SQLAlchemy ORM throughout — no SQL injection risk
- Next.js 14 with TypeScript strict mode, no console.log leaks
- Multi-stage Docker builds for frontend
- Comprehensive README + deployment docs (Supabase, AWS ECS, single EC2)
- Health checks configured on all Docker services
- `.env` properly gitignored, no real secrets in code
- CORS is env-configurable (not wildcard)

---

## Fix order (when ready)

1. Add LICENSE file (decide: MIT, Apache 2.0, or commercial)
2. Remove JWT_SECRET fallbacks + add startup validation in config.py
3. Fix scanner-v3 dependency (embed, submodule, or document as external)
4. Remove or make guest user opt-in via env var
5. Pin Python dependencies (`>=` -> `==`)
6. Strengthen password policy (6 -> 8+ chars)
7. Replace print() with logging
8. Remove weak DB password defaults
