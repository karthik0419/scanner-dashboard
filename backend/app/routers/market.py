"""Market data router — sector heat, market regime, stock universe info."""
import sys
import os
from fastapi import APIRouter, Depends, HTTPException

from app.models import User
from app.deps import get_current_user
from app.config import settings
from app.schemas import SectorHeat, MarketRegime

router = APIRouter(prefix="/api/market", tags=["market"])


def _import_scanner_module(module_path: str):
    """Import a scanner-v3 module by adding scanner dir to sys.path."""
    scanner_path = settings.scanner_v3_path
    if not os.path.isabs(scanner_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        scanner_path = os.path.join(backend_dir, scanner_path)
    if scanner_path not in sys.path:
        sys.path.insert(0, scanner_path)
    return __import__(module_path, fromlist=["x"])


@router.get("/sectors", response_model=list[SectorHeat])
def sector_heat(user: User = Depends(get_current_user)):
    """Get current sector rotation heatmap."""
    try:
        mod = _import_scanner_module("utils.sector_rotation_v3")
        heat = mod.get_sector_heat()
        result = []
        for sector, data in sorted(heat.items(), key=lambda x: x[1].get("score_bonus", 0), reverse=True):
            result.append(SectorHeat(
                sector=sector,
                perf_5d=data.get("perf_5d"),
                perf_20d=data.get("perf_20d"),
                signal=data.get("signal", "COOLING"),
                score_bonus=data.get("score_bonus", 0),
            ))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sector data unavailable: {str(e)[:200]}")


@router.get("/regime", response_model=MarketRegime)
def market_regime(user: User = Depends(get_current_user)):
    """Get current market regime (Nifty vs 200DMA)."""
    try:
        mod = _import_scanner_module("utils.regime")
        regime = mod.get_market_regime()
        if regime is None:
            return MarketRegime(status="UNKNOWN", close=None, dma200=None, pct_from_dma=None)
        return MarketRegime(
            status=regime.get("status", "UNKNOWN"),
            close=regime.get("close"),
            dma200=regime.get("dma200"),
            pct_from_dma=regime.get("pct_from_dma"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regime data unavailable: {str(e)[:200]}")


@router.get("/hot-sectors")
def hot_sectors(top_n: int = 5, user: User = Depends(get_current_user)):
    """Get top performing sectors."""
    try:
        mod = _import_scanner_module("utils.sector_rotation_v3")
        hot = mod.get_hot_sectors(top_n=top_n)
        return [{"sector": s, "perf_5d": p5, "perf_20d": p20} for s, p5, p20 in hot]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)[:200])
