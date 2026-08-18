"""
Scanner Dashboard API — FastAPI entry point.

Wraps scanner-v3 as a production web API with:
- JWT auth + role-based access (admin/user)
- Async scan execution (arq + Redis)
- Saved screen presets
- Categories (tag stocks across picks/tracker/watchlist)
- Price/pattern alerts
- Paper tracker sync
- Market regime + sector heat data
- Interactive OHLCV chart data (Redis-cached) + chart images
- Rate limiting (slowapi)
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.limiter import limiter
from app.routers import auth, scans, picks, charts, screens, alerts, tracker, market, pead, admin, categories
from app.models import User
from app.auth import hash_password

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.main")


def _validate_config():
    """Fail fast on insecure production configuration (audit fix)."""
    default_secret = "change-this-to-a-random-64-char-string"
    if settings.jwt_secret == default_secret:
        if settings.environment == "production":
            raise RuntimeError(
                "JWT_SECRET is still the default value. Set a strong random JWT_SECRET "
                "environment variable before running in production."
            )
        logger.warning("JWT_SECRET is the default value — fine for dev, NOT for production")


def _ensure_guest_user():
    """Create a guest user on startup (demo). Disabled via GUEST_ENABLED=false."""
    if not settings.guest_enabled:
        logger.info("Guest user disabled (GUEST_ENABLED=false)")
        return
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == "guest").first()
        if not existing:
            guest = User(
                email="guest",
                name="Guest",
                hashed_password=hash_password("guest"),
                plan="free",
                role="user",
            )
            db.add(guest)
            db.commit()
            logger.info("Guest user created (guest / guest)")
    except Exception as e:
        logger.error("Could not create guest user: %s", e)
    finally:
        db.close()


def _bootstrap_admin():
    """Promote the configured ADMIN_EMAIL user to admin role on startup."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == settings.admin_email).first()
        if user and user.role != "admin":
            user.role = "admin"
            db.commit()
            logger.info("Promoted %s to admin", user.email)
        elif not user:
            logger.info("Admin bootstrap: no user with email %s yet (will promote when registered)", settings.admin_email)
    except Exception as e:
        logger.error("Admin bootstrap failed: %s", e)
    finally:
        db.close()


def _run_migrations():
    """Run lightweight inline migrations (add columns to existing tables)."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    migrations = [
        # (table, column, DDL)
        ("scans", "scan_name", "ALTER TABLE scans ADD COLUMN scan_name VARCHAR(100)"),
        ("users", "role", "ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user'"),
    ]
    for table, column, ddl in migrations:
        try:
            if insp.has_table(table):
                columns = [c["name"] for c in insp.get_columns(table)]
                if column not in columns:
                    with engine.connect() as conn:
                        conn.execute(text(ddl))
                        conn.commit()
                    logger.info("Migration: added %s.%s", table, column)
        except Exception as e:
            logger.warning("Migration %s.%s skipped: %s", table, column, e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_config()
    # Create tables on startup (use Alembic for migrations in production)
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    _ensure_guest_user()
    _bootstrap_admin()
    yield


app = FastAPI(
    title="Scanner Dashboard API",
    description="NSE swing setup scanner — web API wrapping scanner-v3",
    version="1.1.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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
app.include_router(admin.router)
app.include_router(categories.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.1.0"}
