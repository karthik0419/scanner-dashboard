"""
Scanner Dashboard API — FastAPI entry point.

Wraps scanner-v3 as a production web API with:
- JWT auth
- Async scan execution (arq + Redis)
- Saved screen presets
- Price/pattern alerts
- Paper tracker sync
- Market regime + sector heat data
- Chart generation + serving
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.routers import auth, scans, picks, charts, screens, alerts, tracker, market, pead
from app.models import User
from app.auth import hash_password


def _ensure_guest_user():
    """Create a guest user on startup if it doesn't exist."""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "guest@guest.com").first()
        if not existing:
            guest = User(
                email="guest@guest.com",
                name="Guest",
                hashed_password=hash_password("guest"),
                plan="free",
            )
            db.add(guest)
            db.commit()
            print("[startup] Guest user created (guest@guest.com / guest)")
        else:
            print("[startup] Guest user already exists")
    except Exception as e:
        print(f"[startup] Could not create guest user: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic for migrations in production)
    Base.metadata.create_all(bind=engine)
    _ensure_guest_user()
    yield


app = FastAPI(
    title="Scanner Dashboard API",
    description="NSE swing setup scanner — web API wrapping scanner-v3",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(scans.router)
app.include_router(picks.router)
app.include_router(charts.router)
app.include_router(screens.router)
app.include_router(alerts.router)
app.include_router(tracker.router)
app.include_router(market.router)
app.include_router(pead.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
