"""Scans router — trigger, list, detail, cancel."""
import os
import signal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from arq import create_pool
from arq.connections import RedisSettings

from app.database import get_db
from app.config import settings
from app.models import Scan, ScanStatus, User
from app.deps import get_current_user
from app.schemas import ScanTrigger, ScanOut
from app.services.worker import run_scan_job

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.post("/trigger", response_model=ScanOut, status_code=202)
async def trigger_scan(
    payload: ScanTrigger,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trigger a new scan. Runs asynchronously via arq worker."""
    scan = Scan(
        user_id=user.id,
        status=ScanStatus.queued.value,
        top=payload.top,
        min_score=payload.min_score,
        sl_mode=payload.sl_mode,
        min_price=payload.min_price,
        max_price=payload.max_price,
        stocks_file=payload.stocks_file,
        bearish=payload.bearish,
        timeframe=payload.timeframe,
        smart=payload.smart,
        test_mode=payload.test_mode,
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    # Enqueue background job
    params = {
        "top": payload.top,
        "min_score": payload.min_score,
        "sl_mode": payload.sl_mode,
        "min_price": payload.min_price,
        "max_price": payload.max_price,
        "stocks_file": payload.stocks_file,
        "bearish": payload.bearish,
        "timeframe": payload.timeframe,
        "smart": payload.smart,
        "test_mode": payload.test_mode,
    }
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("run_scan_job", scan.id, params)

    return scan


@router.get("", response_model=list[ScanOut])
def list_scans(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scans = (
        db.query(Scan)
        .filter(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return scans


@router.get("/health/worker")
async def worker_health():
    """Check if the arq worker is alive by testing Redis queue connection."""
    try:
        redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        jobs = await redis.queued_jobs()
        await redis.close()
        return {"worker": "reachable", "queued_jobs": len(jobs)}
    except Exception as e:
        return {"worker": "unreachable", "error": str(e)[:200]}


@router.get("/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.post("/{scan_id}/cancel", response_model=ScanOut)
def cancel_scan(scan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cancel a queued or running scan. Kills the subprocess if running."""
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.status not in (ScanStatus.queued.value, ScanStatus.running.value):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel scan with status '{scan.status}'. Only queued or running scans can be cancelled."
        )

    # Kill the subprocess if it's running
    if scan.process_pid:
        try:
            pid = scan.process_pid
            # On Windows, use taskkill /F /PID (NO /T — /T would kill the worker too)
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
                    pass  # already dead
        except Exception:
            pass  # best-effort kill; still mark as cancelled
        scan.process_pid = None

    scan.status = ScanStatus.cancelled.value
    scan.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(scan)
    return scan
