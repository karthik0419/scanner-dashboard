"""
arq worker — processes async scan jobs from the Redis queue.

Run with:
    arq app.services.worker.WorkerSettings
"""
import os
import sys
from datetime import datetime

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.database import SessionLocal
from app.models import Scan, Pick, ScanStatus, PeadScan, PeadPick
from app.services.scanner_service import run_scan_subprocess, run_pead_scan_subprocess


async def run_scan_job(ctx, scan_id: str, params: dict):
    """Background job: run scanner.py subprocess, parse results, update DB."""
    db = SessionLocal()
    try:
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
        if not scan:
            return {"error": "scan not found"}

        # Check if already cancelled before starting
        if scan.status == ScanStatus.cancelled.value:
            return {"error": "scan was cancelled before starting"}

        scan.status = ScanStatus.running.value
        scan.started_at = datetime.utcnow()
        db.commit()

        # Callback to store the subprocess PID so it can be killed
        def store_pid(pid):
            scan.process_pid = pid
            db.commit()

        try:
            result = run_scan_subprocess(**params, on_pid=store_pid)
        except InterruptedError:
            # Process was killed (cancelled by user)
            scan.status = ScanStatus.cancelled.value
            scan.completed_at = datetime.utcnow()
            scan.process_pid = None
            db.commit()
            return {"scan_id": scan_id, "cancelled": True}
        except Exception as e:
            # Check if the scan was cancelled while the subprocess was running
            db.refresh(scan)
            if scan.status == ScanStatus.cancelled.value:
                scan.process_pid = None
                db.commit()
                return {"scan_id": scan_id, "cancelled": True}
            scan.status = ScanStatus.failed.value
            scan.error_message = str(e)[:2000]
            scan.completed_at = datetime.utcnow()
            scan.process_pid = None
            db.commit()
            return {"error": str(e)[:500]}

        # Insert picks
        for row in result["picks"]:
            pick = Pick(
                scan_id=scan_id,
                symbol=row.get("symbol"),
                pattern=row.get("pattern"),
                timeframe=row.get("timeframe"),
                status=row.get("status"),
                cmp=_f(row.get("cmp")),
                breakout=_f(row.get("breakout")),
                stop_loss=_f(row.get("stop_loss")),
                target_1=_f(row.get("target_1")),
                target_2=_f(row.get("target_2")),
                upside_pct=_f(row.get("upside_pct")),
                risk_pct=_f(row.get("risk_pct")),
                upside_remaining=_f(row.get("upside_remaining")),
                pct_done=_f(row.get("pct_done")),
                pct_left=_f(row.get("pct_left")),
                sustained=_b(row.get("sustained")),
                nested_cup=_b(row.get("nested_cup")),
                double_confirm=_b(row.get("double_confirm")),
                hist_resist=_f(row.get("hist_resist")),
                rr=_f(row.get("rr")),
                volume=_f(row.get("volume")),
                neckline=_f(row.get("neckline")),
                sector=row.get("sector"),
                sector_signal=row.get("sector_signal"),
                score=_f(row.get("score")),
                atr=_f(row.get("atr")),
            )
            db.add(pick)

        scan.status = ScanStatus.completed.value
        scan.total_picks = result["total"]
        scan.csv_path = result["csv_path"]
        scan.completed_at = datetime.utcnow()
        scan.duration_seconds = result["duration"]
        scan.process_pid = None
        db.commit()

        return {"scan_id": scan_id, "total_picks": result["total"]}
    finally:
        db.close()


def _f(v):
    """Safely convert to float or None."""
    if v is None or (isinstance(v, float) and v != v):  # NaN check
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _b(v):
    """Safely convert to bool or None."""
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("true", "1", "yes")
    return bool(v)


async def startup(ctx):
    print("Scanner worker started.")


async def shutdown(ctx):
    print("Scanner worker shutting down.")


def _i(v):
    """Safely convert to int or None."""
    if v is None or (isinstance(v, float) and v != v):
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


async def run_pead_scan_job(ctx, scan_id: str, params: dict):
    """Background job: run PEAD scanner.py subprocess, parse results, update DB."""
    db = SessionLocal()
    try:
        scan = db.query(PeadScan).filter(PeadScan.id == scan_id).first()
        if not scan:
            return {"error": "pead scan not found"}

        if scan.status == ScanStatus.cancelled.value:
            return {"error": "scan was cancelled before starting"}

        scan.status = ScanStatus.running.value
        scan.started_at = datetime.utcnow()
        db.commit()

        def store_pid(pid):
            scan.process_pid = pid
            db.commit()

        try:
            result = run_pead_scan_subprocess(**params, on_pid=store_pid)
        except InterruptedError:
            scan.status = ScanStatus.cancelled.value
            scan.completed_at = datetime.utcnow()
            scan.process_pid = None
            db.commit()
            return {"scan_id": scan_id, "cancelled": True}
        except Exception as e:
            db.refresh(scan)
            if scan.status == ScanStatus.cancelled.value:
                scan.process_pid = None
                db.commit()
                return {"scan_id": scan_id, "cancelled": True}
            scan.status = ScanStatus.failed.value
            scan.error_message = str(e)[:2000]
            scan.completed_at = datetime.utcnow()
            scan.process_pid = None
            db.commit()
            return {"error": str(e)[:500]}

        # Insert PEAD picks
        for row in result["picks"]:
            pick = PeadPick(
                scan_id=scan_id,
                symbol=row.get("symbol"),
                sector=row.get("sector"),
                status=row.get("status"),
                mode=row.get("mode"),
                days_since_result=_i(row.get("days_since_result")),
                days_to_result=_i(row.get("days_to_result")),
                last_quarter=row.get("last_quarter"),
                result_date=row.get("result_date"),
                cmp=_f(row.get("cmp")),
                entry=_f(row.get("entry")),
                stop=_f(row.get("stop")),
                target=_f(row.get("target")),
                rr=_f(row.get("rr")),
                last_net_profit=_f(row.get("last_net_profit")),
                last_eps=_f(row.get("last_eps")),
                proj_profit=_f(row.get("proj_profit")),
                proj_eps=_f(row.get("proj_eps")),
                proj_yoy_growth=_f(row.get("proj_yoy_growth")),
                proj_confidence=row.get("proj_confidence"),
                avg_spike_pct=_f(row.get("avg_spike_pct")),
                consistency_score=_f(row.get("consistency_score")),
                avg_yoy_growth=_f(row.get("avg_yoy_growth")),
                growth_quarters=_i(row.get("growth_quarters")),
                sector_rank=_i(row.get("sector_rank")),
                score=_f(row.get("score")),
            )
            db.add(pick)

        scan.status = ScanStatus.completed.value
        scan.total_picks = result["total"]
        scan.csv_path = result["csv_path"]
        scan.completed_at = datetime.utcnow()
        scan.duration_seconds = result["duration"]
        scan.process_pid = None
        db.commit()

        return {"scan_id": scan_id, "total_picks": result["total"]}
    finally:
        db.close()


class WorkerSettings:
    functions = [run_scan_job, run_pead_scan_job]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 1  # scans are CPU-heavy; one at a time
    job_timeout = 2700  # 45 min (full NSE swing scans + PEAD scans can be slow)
