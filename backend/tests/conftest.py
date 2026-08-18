"""Pytest configuration and fixtures for scanner-dashboard backend tests.

Uses a separate test database (scanner_dashboard_test) with transaction rollback
for test isolation. The test database is created once; each test runs inside a
transaction that is rolled back after the test completes.

Tests use FastAPI's TestClient (synchronous) which is backed by httpx.
"""
import os
import sys
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Ensure the backend app is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Test database setup ──────────────────────────────────────────────────
# Use a dedicated test database on the same postgres instance (port 5433).
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://scanner:scanner@localhost:5433/scanner_dashboard_test",
)

# Redis URL for tests (use a separate DB index to avoid polluting dev cache)
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://localhost:6380/15")

# Override settings BEFORE importing app modules
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["REDIS_URL"] = TEST_REDIS_URL
os.environ["JWT_SECRET"] = "test-secret-key-for-pytest-only-64-chars-padding!!"
os.environ["GUEST_ENABLED"] = "false"
os.environ["SCANNER_V3_PATH"] = "/scanner-v3"
os.environ["PEAD_SCANNER_PATH"] = "/earnings-momentum-scanner"

from app.database import Base, get_db
from app.models import User
from app.auth import hash_password
from app.config import settings

# Create the test engine
test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Redis client for clearing rate limit counters between tests
import redis as redis_lib
_test_redis = redis_lib.Redis.from_url(TEST_REDIS_URL, decode_responses=True)


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    """Create all tables in the test database once per session."""
    Base.metadata.create_all(bind=test_engine)
    # Flush the test Redis DB at session start
    try:
        _test_redis.flushdb()
    except Exception:
        pass
    yield
    # Optionally drop tables after session (leave for inspection)
    # Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    """Clear rate limit counters in Redis before each test to avoid cross-test interference."""
    try:
        _test_redis.flushdb()
    except Exception:
        pass


@pytest.fixture
def db_session():
    """Yield a DB session with transaction rollback for test isolation."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = TestSessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    """FastAPI TestClient with the DB dependency overridden to use the test session."""
    from fastapi.testclient import TestClient
    from app.main import app

    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ── User fixtures ────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db_session):
    """Create an admin user directly in the DB."""
    user = User(
        email="admin@test.com",
        name="Admin Test",
        hashed_password=hash_password("adminpass123"),
        role="admin",
        plan="pro",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def regular_user(db_session):
    """Create a regular user directly in the DB."""
    user = User(
        email="user@test.com",
        name="Regular Test",
        hashed_password=hash_password("userpass123"),
        role="user",
        plan="free",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def second_user(db_session):
    """Create a second regular user for isolation tests."""
    user = User(
        email="user2@test.com",
        name="User Two",
        hashed_password=hash_password("user2pass123"),
        role="user",
        plan="free",
        is_active=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(client, admin_user):
    """Login as admin and return the JWT token."""
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "adminpass123"})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def user_token(client, regular_user):
    """Login as regular user and return the JWT token."""
    r = client.post("/api/auth/login", json={"email": "user@test.com", "password": "userpass123"})
    assert r.status_code == 200, f"User login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def user2_token(client, second_user):
    """Login as second user and return the JWT token."""
    r = client.post("/api/auth/login", json={"email": "user2@test.com", "password": "user2pass123"})
    assert r.status_code == 200, f"User2 login failed: {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def auth_headers():
    """Return a helper that builds auth headers from a token."""
    def _make(token):
        return {"Authorization": f"Bearer {token}"}
    return _make
