"""PEAD scanner router — trigger, list, detail, cancel, picks."""
import os
import signal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from arq import create_pool
from arq.connections import RedisSettings

from app.database import get_db
from app.config import settings
from app.models import PeadScan, PeadPick, ScanStatus, User
from app.deps import get_current_user
from app.schemas import PeadScanTrigger, PeadScanOut, PeadPickOut

router = APIRouter(prefix="/api/pead", tags=["pead"])


@router.post("/trigger", response_model=PeadScanOut, status_code=202)
async def trigger_pead_scan(
    payload: PeadScanTrigger,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a new PEAD scan. Runs asynchronously via arq worker."""
    scan = PeadScan(
        user_id=user.id,
        status=ScanStatus.queued.value,
        mode=payload.mode,
        top=payload.top,
        min_score=payload.min_score,
        sector=payload.sector,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    params = {
        "mode": payload.mode,
        "top": payload.top,
        "min_score": payload.min_score,
        "sector": payload.sector,
    }
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("run_pead_scan_job", scan.id, params)

    return scan


@router.get("", response_model=list[PeadScanOut])
def list_pead_scans(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scans = (
        db.query(PeadScan)
        .filter(PeadScan.user_id == user.id)
        .order_by(PeadScan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return scans


@router.get("/{scan_id}", response_model=PeadScanOut)
def get_pead_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = db.query(PeadScan).filter(PeadScan.id == scan_id, PeadScan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="PEAD scan not found")
    return scan


@router.post("/{scan_id}/cancel", response_model=PeadScanOut)
def cancel_pead_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cancel a queued or running PEAD scan."""
    scan = db.query(PeadScan).filter(PeadScan.id == scan_id, PeadScan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="PEAD scan not found")

    if scan.status not in (ScanStatus.queued.value, ScanStatus.running.value):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel scan with status '{scan.status}'."
        )

    if scan.process_pid:
        try:
            pid = scan.process_pid
            if os.name == "nt":
                import subprocess
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(pid)],
                    capture_output=True, timeout=10,
                )
            else:
                try:
                    os.kill(pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        except Exception:
            pass
        scan.process_pid = None

    scan.status = ScanStatus.cancelled.value
    scan.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(scan)
    return scan


@router.get("/{scan_id}/picks")
def list_pead_picks(
    scan_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("score", pattern="^(score|rr|symbol|avg_spike_pct|proj_yoy_growth)$"),
    sort_desc: bool = Query(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List picks for a PEAD scan."""
    scan = db.query(PeadScan).filter(PeadScan.id == scan_id, PeadScan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="PEAD scan not found")

    query = db.query(PeadPick).filter(PeadPick.scan_id == scan_id)

    sort_col = getattr(PeadPick, sort_by, PeadPick.score)
    if sort_desc:
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total = query.count()
    picks = query.offset(offset).limit(limit).all()

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "scan_status": scan.status,
        "items": picks,
    }
