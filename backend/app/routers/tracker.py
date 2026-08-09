"""Paper tracker router — view paper trades synced from scanner-v3."""
import os
import glob
import pandas as pd
from datetime import datetime, date
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import PaperTrade, User
from app.deps import get_current_user
from app.schemas import PaperTradeOut
from app.config import settings

router = APIRouter(prefix="/api/tracker", tags=["paper-tracker"])


def _tracker_csv_path() -> str | None:
    """Find the paper tracker CSV in scanner-v3 results/."""
    scanner_path = settings.scanner_v3_path
    if not os.path.isabs(scanner_path):
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        scanner_path = os.path.join(backend_dir, scanner_path)
    path = os.path.join(scanner_path, "results", "paper_tracker.csv")
    return path if os.path.isfile(path) else None


@router.get("", response_model=list[PaperTradeOut])
def list_trades(
    status: str | None = Query(None),
    symbol: str | None = Query(None),
    scan_date: str | None = Query(None, description="Filter by scan date (YYYY-MM-DD)"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(PaperTrade).filter(PaperTrade.user_id == user.id)
    if status:
        q = q.filter(PaperTrade.current_status == status)
    if symbol:
        q = q.filter(PaperTrade.symbol.ilike(f"%{symbol}%"))
    if scan_date:
        # Filter by date part of scan_date
        q = q.filter(func.date(PaperTrade.scan_date) == scan_date)
    return q.order_by(PaperTrade.scan_date.desc(), PaperTrade.score.desc()).all()


@router.get("/dates")
def list_scan_dates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List distinct scan dates with trade counts and summary stats per date."""
    trades = db.query(PaperTrade).filter(PaperTrade.user_id == user.id).all()

    # Group by date
    by_date = defaultdict(list)
    for t in trades:
        if t.scan_date:
            d = t.scan_date.date().isoformat() if hasattr(t.scan_date, 'date') else str(t.scan_date)[:10]
            by_date[d].append(t)

    result = []
    for d in sorted(by_date.keys(), reverse=True):
        date_trades = by_date[d]
        open_count = sum(1 for t in date_trades if t.current_status in ('OPEN', 'WAITING_BREAKOUT', 'RE_ENTERED'))
        win_count = sum(1 for t in date_trades if t.current_status in ('WIN_T1', 'WIN_T2'))
        loss_count = sum(1 for t in date_trades if t.current_status == 'LOSS')
        enter_now = sum(1 for t in date_trades if t.current_status == 'OPEN')
        waiting = sum(1 for t in date_trades if t.current_status == 'WAITING_BREAKOUT')
        avg_pnl = sum(t.current_pnl_pct or 0 for t in date_trades) / max(len(date_trades), 1)

        result.append({
            "date": d,
            "total": len(date_trades),
            "open": open_count,
            "wins": win_count,
            "losses": loss_count,
            "enter_now": enter_now,
            "waiting": waiting,
            "avg_pnl": round(avg_pnl, 2),
        })

    return result


@router.get("/summary")
def tracker_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Summary stats for paper trades."""
    trades = db.query(PaperTrade).filter(PaperTrade.user_id == user.id).all()
    if not trades:
        return {"total": 0, "message": "No paper trades yet"}

    from collections import Counter
    status_dist = Counter(t.current_status for t in trades)
    wins = status_dist.get("WIN_T1", 0) + status_dist.get("WIN_T2", 0)
    losses = status_dist.get("LOSS", 0)
    open_count = status_dist.get("OPEN", 0) + status_dist.get("WAITING_BREAKOUT", 0)

    return {
        "total": len(trades),
        "by_status": dict(status_dist),
        "wins": wins,
        "losses": losses,
        "open": open_count,
        "win_rate": round(wins / max(wins + losses, 1) * 100, 1),
        "avg_pnl": round(sum(t.current_pnl_pct for t in trades if t.current_pnl_pct is not None) / max(len(trades), 1), 2),
    }


@router.post("/sync", response_model=dict)
def sync_tracker(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Sync paper trades from scanner-v3's paper_tracker.csv into the database."""
    csv_path = _tracker_csv_path()
    if csv_path is None:
        raise HTTPException(status_code=404, detail="No paper_tracker.csv found. Run paper_tracker.py in scanner-v3 first.")

    df = pd.read_csv(csv_path)
    synced = 0
    for _, row in df.iterrows():
        symbol = row.get("symbol")
        if not symbol:
            continue
        # Check if trade already exists for this user + symbol + scan_date
        scan_date_str = row.get("scan_date")
        existing = db.query(PaperTrade).filter(
            PaperTrade.user_id == user.id,
            PaperTrade.symbol == symbol,
        ).first()

        if existing:
            # Update current status
            existing.current_price = _f(row.get("current_price"))
            existing.current_status = row.get("current_status", existing.current_status)
            existing.current_pnl_pct = _f(row.get("current_pnl_pct"))
            existing.days_held = int(row.get("days_held", 0) or 0)
            existing.exit_price = _f(row.get("exit_price"))
            existing.exit_reason = row.get("exit_reason")
        else:
            trade = PaperTrade(
                user_id=user.id,
                symbol=symbol,
                pattern=row.get("pattern"),
                status_at_scan=row.get("status_at_scan"),
                breakout_level=_f(row.get("breakout_level")),
                entry_price=_f(row.get("entry_price")),
                stop_loss=_f(row.get("stop_loss")),
                target_1=_f(row.get("target_1")),
                target_2=_f(row.get("target_2")),
                scan_date=datetime.now(),
                cmp_at_scan=_f(row.get("cmp_at_scan")),
                risk_pct=_f(row.get("risk_pct")),
                upside_pct=_f(row.get("upside_pct")),
                rr=_f(row.get("rr")),
                score=_f(row.get("score")),
                sector=row.get("sector"),
                current_price=_f(row.get("current_price")),
                current_status=row.get("current_status", "OPEN"),
                current_pnl_pct=_f(row.get("current_pnl_pct")),
                days_held=int(row.get("days_held", 0) or 0),
                exit_price=_f(row.get("exit_price")),
                exit_reason=row.get("exit_reason"),
                tradeable=row.get("tradeable", "TRADE"),
            )
            db.add(trade)
        synced += 1

    db.commit()
    return {"synced": synced}


def _f(v):
    if v is None or (isinstance(v, float) and v != v):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
