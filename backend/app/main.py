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
from app.database import Base, engine
from app.routers import auth, scans, picks, charts, screens, alerts, tracker, market


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic for migrations in production)
    Base.metadata.create_all(bind=engine)
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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
