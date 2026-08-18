"""Charts router — interactive OHLCV data + legacy chart images.

All endpoints require JWT auth (get_current_user). OHLCV is rate-limited
per account (JWT-keyed) and Redis-cached to protect the yfinance upstream.
"""
import os
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse

from app.config import settings
from app.limiter import limiter
from app.models import User
from app.deps import get_current_user
from app.services.scanner_service import generate_chart, _scanner_dir

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/charts", tags=["charts"])

# Redis client for OHLCV caching (lazy init, falls back to no cache)
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            import redis as redis_lib
            _redis_client = redis_lib.Redis.from_url(settings.redis_url, decode_responses=True)
            _redis_client.ping()
        except Exception as e:
            logger.warning("Redis unavailable for OHLCV cache: %s", e)
            _redis_client = False  # sentinel: don't retry every request
    return _redis_client if _redis_client else None


# Valid period per timeframe (yfinance)
_TIMEFRAME_CONFIG = {
    "daily":   {"interval": "1d",  "period": "1y"},
    "weekly":  {"interval": "1wk", "period": "5y"},
    "monthly": {"interval": "1mo", "period": "10y"},
}
_OHLCV_CACHE_TTL = 60 * 60 * 6  # 6 hours — EOD data doesn't change intraday for swing use


@router.get("/{symbol}/ohlcv")
@limiter.limit("120/minute")
def get_ohlcv(
    request: Request,
    symbol: str,
    timeframe: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    user: User = Depends(get_current_user),
):
    """OHLCV bars as JSON for interactive charts (lightweight-charts format).

    Returns bars sorted ascending by time: {time, open, high, low, close, volume}.
    Cached in Redis for 6h per (symbol, timeframe).
    """
    norm = symbol.upper().replace(".NS", "").strip()
    if not norm.replace("-", "").replace("&", "").replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="Invalid symbol")

    cache_key = f"ohlcv:{norm}:{timeframe}"
    r = _get_redis()
    if r:
        try:
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    cfg = _TIMEFRAME_CONFIG[timeframe]
    try:
        import yfinance as yf
        ticker = yf.Ticker(f"{norm}.NS")
        hist = ticker.history(period=cfg["period"], interval=cfg["interval"], auto_adjust=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Data fetch failed: {str(e)[:200]}")

    if hist is None or hist.empty:
        raise HTTPException(status_code=404, detail=f"No price data for {norm}")

    bars = []
    for ts, row in hist.iterrows():
        o, h, l, c = row.get("Open"), row.get("High"), row.get("Low"), row.get("Close")
        if any(v is None or v != v for v in (o, h, l, c)):  # skip NaN rows
            continue
        bars.append({
            "time": ts.strftime("%Y-%m-%d"),
            "open": round(float(o), 2),
            "high": round(float(h), 2),
            "low": round(float(l), 2),
            "close": round(float(c), 2),
            "volume": float(row.get("Volume") or 0),
        })

    payload = {"symbol": norm, "timeframe": timeframe, "period": cfg["period"], "bars": bars}

    if r and bars:
        try:
            r.setex(cache_key, _OHLCV_CACHE_TTL, json.dumps(payload))
        except Exception:
            pass

    return payload


@router.get("/{symbol}")
def get_chart(
    symbol: str,
    timeframe: str = Query("daily", pattern="^(daily|weekly|monthly)$"),
    user: User = Depends(get_current_user),
):
    """Get a chart image for a symbol. Generates if not cached."""
    symbol = symbol.upper().replace(".NS", "")
    scanner_dir = _scanner_dir()
    chart_path = os.path.join(scanner_dir, "results", "charts", timeframe, f"{symbol}.png")

    if not os.path.isfile(chart_path):
        try:
            result = generate_chart(symbol)
            chart_path = result["charts"].get(timeframe)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chart generation failed: {str(e)[:200]}")

    if not chart_path or not os.path.isfile(chart_path):
        raise HTTPException(status_code=404, detail=f"No {timeframe} chart for {symbol}")

    return FileResponse(chart_path, media_type="image/png")


@router.post("/{symbol}/generate")
def generate(
    symbol: str,
    user: User = Depends(get_current_user),
):
    """Force-generate all 3 timeframe charts for a symbol."""
    symbol = symbol.upper().replace(".NS", "")
    try:
        result = generate_chart(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:300])
    return {"symbol": symbol, "charts": {k: f"/api/charts/{symbol}?timeframe={k}" for k in result["charts"]}}
