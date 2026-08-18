"""Shared rate limiter (slowapi) — Redis-backed, JWT-aware.

Rate limits are keyed by the authenticated user ID (from the JWT Bearer token)
so each account gets its own quota — users behind a shared IP/NAT don't eat
each other's limits. Anonymous requests (login/register) fall back to client IP.

Separate module so routers can import it without circular imports with main.
"""
import logging
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger(__name__)


def user_or_ip_key(request: Request) -> str:
    """Key rate limits by JWT user id when authenticated, else client IP."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from app.auth import decode_access_token
            payload = decode_access_token(auth[7:])
            uid = payload.get("sub")
            if uid:
                return f"user:{uid}"
        except Exception:
            pass  # invalid/expired token → fall through to IP
    return f"ip:{get_remote_address(request)}"


def _make_limiter() -> Limiter:
    try:
        return Limiter(
            key_func=user_or_ip_key,
            storage_uri=settings.redis_url,
            strategy="fixed-window",
        )
    except Exception as e:
        logger.warning("Redis limiter storage unavailable (%s) — using in-memory", e)
        return Limiter(key_func=user_or_ip_key)


limiter = _make_limiter()
