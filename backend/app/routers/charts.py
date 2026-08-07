"""Charts router — generate and serve chart images for a symbol."""
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from app.models import User
from app.deps import get_current_user
from app.services.scanner_service import generate_chart, _scanner_dir

router = APIRouter(prefix="/api/charts", tags=["charts"])


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
