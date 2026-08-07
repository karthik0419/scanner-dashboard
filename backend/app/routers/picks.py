"""Picks router — list/filter picks from a scan."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from app.database import get_db
from app.models import Pick, Scan, User
from app.deps import get_current_user
from app.schemas import PickOut

router = APIRouter(prefix="/api/picks", tags=["picks"])


@router.get("/scan/{scan_id}")
def list_picks(
    scan_id: str,
    pattern: str | None = Query(None),
    timeframe: str | None = Query(None),
    status: str | None = Query(None),
    sector: str | None = Query(None),
    min_score: float | None = Query(None),
    min_rr: float | None = Query(None),
    sort_by: str = Query("score", pattern="^(score|rr|upside_pct|symbol|risk_pct)$"),
    sort_desc: bool = Query(True),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List picks for a scan with optional filters."""
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    q = db.query(Pick).filter(Pick.scan_id == scan_id)

    if pattern:
        q = q.filter(Pick.pattern.ilike(f"%{pattern}%"))
    if timeframe:
        q = q.filter(Pick.timeframe == timeframe)
    if status:
        q = q.filter(Pick.status == status)
    if sector:
        q = q.filter(Pick.sector.ilike(f"%{sector}%"))
    if min_score is not None:
        q = q.filter(Pick.score >= min_score)
    if min_rr is not None:
        q = q.filter(Pick.rr >= min_rr)

    total = q.count()

    sort_col = getattr(Pick, sort_by, Pick.score)
    q = q.order_by(desc(sort_col) if sort_desc else asc(sort_col))
    picks = q.offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "scan_status": scan.status,
        "items": [PickOut.model_validate(p) for p in picks],
    }


@router.get("/{pick_id}", response_model=PickOut)
def get_pick(pick_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pick = db.query(Pick).join(Scan).filter(Pick.id == pick_id, Scan.user_id == user.id).first()
    if not pick:
        raise HTTPException(status_code=404, detail="Pick not found")
    return pick


@router.get("/scan/{scan_id}/stats")
def scan_stats(
    scan_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate stats for a scan — pattern distribution, sector breakdown, etc."""
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    picks = db.query(Pick).filter(Pick.scan_id == scan_id).all()

    from collections import Counter
    pattern_dist = Counter(p.pattern for p in picks if p.pattern)
    timeframe_dist = Counter(p.timeframe for p in picks if p.timeframe)
    status_dist = Counter(p.status for p in picks if p.status)
    sector_dist = Counter(p.sector for p in picks if p.sector)

    return {
        "total_picks": len(picks),
        "by_pattern": dict(pattern_dist.most_common()),
        "by_timeframe": dict(timeframe_dist),
        "by_status": dict(status_dist),
        "by_sector": dict(sector_dist.most_common(15)),
        "avg_score": sum(p.score for p in picks if p.score) / max(len(picks), 1),
        "avg_rr": sum(p.rr for p in picks if p.rr) / max(len(picks), 1),
    }
