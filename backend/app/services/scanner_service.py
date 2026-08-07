"""
Scanner service — runs scanner-v3 as a subprocess and parses the output CSV.

This approach keeps scanner-v3 untouched (no refactoring risk to a proven engine)
and provides process isolation (no global state leaks, no memory growth in the
API process).
"""
import os
import sys
import subprocess
import glob
import time
from datetime import datetime
from typing import Optional
import pandas as pd

from app.config import settings


def _scanner_dir() -> str:
    """Resolve the scanner-v3 directory path."""
    path = settings.scanner_v3_path
    if not os.path.isabs(path):
        # Relative to backend/ directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        path = os.path.join(backend_dir, path)
    if not os.path.isdir(path):
        raise FileNotFoundError(f"Scanner-v3 directory not found: {path}")
    return path


def build_scan_command(
    top: int = 30,
    min_score: float = 50,
    sl_mode: str = "atr",
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    stocks_file: Optional[str] = None,
    bearish: bool = False,
    timeframe: str = "all",
    smart: bool = False,
    test_mode: bool = False,
) -> list:
    """Build the scanner.py CLI command from parameters."""
    cmd = [sys.executable, "scanner.py",
           "--top", str(top),
           "--min-score", str(min_score),
           "--sl-mode", sl_mode,
           "--no-notify", "--no-sync"]

    if min_price is not None:
        cmd += ["--min-price", str(min_price)]
    if max_price is not None:
        cmd += ["--max-price", str(max_price)]
    if stocks_file:
        cmd += ["--stocks", stocks_file]
    if bearish:
        cmd += ["--bearish"]
    if timeframe != "all":
        cmd += ["--timeframe", timeframe]
    if smart:
        cmd += ["--smart"]
    if test_mode:
        cmd += ["--test"]
    return cmd


def find_latest_csv(scanner_dir: str, bearish: bool = False) -> Optional[str]:
    """Find the latest scan output CSV in the scanner-v3 results/ directory."""
    results_dir = os.path.join(scanner_dir, "results")
    if not os.path.isdir(results_dir):
        return None
    prefix = "v3_bearish_" if bearish else "v3_"
    pattern = os.path.join(results_dir, f"{prefix}*.csv")
    csvs = [f for f in glob.glob(pattern) if "_all" not in os.path.basename(f)]
    if not csvs:
        return None
    return max(csvs, key=os.path.getmtime)


def run_scan_subprocess(
    top: int = 30,
    min_score: float = 50,
    sl_mode: str = "atr",
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    stocks_file: Optional[str] = None,
    bearish: bool = False,
    timeframe: str = "all",
    smart: bool = False,
    test_mode: bool = False,
    on_pid: Optional[callable] = None,
) -> dict:
    """
    Run scanner.py as a subprocess and return results.

    Args:
        on_pid: Optional callback called with the subprocess PID once started.
            Used by the worker to store the PID so the scan can be killed.

    Returns:
        {
            "csv_path": str,      # path to output CSV
            "picks": list[dict],  # parsed pick rows
            "total": int,         # number of picks
            "duration": float,    # seconds
            "stdout": str,        # scanner stdout (last 2000 chars)
            "stderr": str,        # scanner stderr (last 2000 chars)
        }

    Raises:
        RuntimeError: if scanner.py exits with non-zero code.
        InterruptedError: if the process was killed/cancelled.
    """
    scanner_dir = _scanner_dir()
    cmd = build_scan_command(
        top=top, min_score=min_score, sl_mode=sl_mode,
        min_price=min_price, max_price=max_price,
        stocks_file=stocks_file, bearish=bearish,
        timeframe=timeframe, smart=smart, test_mode=test_mode,
    )

    start = time.time()
    proc = subprocess.Popen(
        cmd, cwd=scanner_dir,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True,
    )
    # Notify caller of the PID so it can be stored for cancellation
    if on_pid:
        on_pid(proc.pid)

    try:
        stdout, stderr = proc.communicate(timeout=1200)  # 20 min max
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        raise RuntimeError("scanner.py timed out after 20 minutes")

    duration = time.time() - start

    # If the process was killed (e.g. cancelled), returncode will be negative
    if proc.returncode < 0:
        raise InterruptedError(f"scanner.py was killed (signal {-proc.returncode})")

    if proc.returncode != 0:
        raise RuntimeError(
            f"scanner.py exited with code {proc.returncode}\n"
            f"stderr: {stderr[-2000:]}"
        )

    csv_path = find_latest_csv(scanner_dir, bearish=bearish)
    if csv_path is None:
        raise RuntimeError(
            f"No output CSV found after scan.\nstdout: {stdout[-2000:]}"
        )

    df = pd.read_csv(csv_path)
    # Normalize column names (scanner uses 'upside_%' which is awkward)
    df = df.rename(columns={"upside_%": "upside_pct", "risk_%": "risk_pct"})

    picks = df.to_dict(orient="records")
    return {
        "csv_path": csv_path,
        "picks": picks,
        "total": len(picks),
        "duration": duration,
        "stdout": stdout[-2000:],
        "stderr": stderr[-2000:],
    }


def generate_chart(symbol: str) -> dict:
    """
    Generate charts for a symbol using gen_charts.py.

    Returns:
        {"charts": {"daily": path, "weekly": path, "monthly": path}}
    """
    scanner_dir = _scanner_dir()
    cmd = [sys.executable, "gen_charts.py", symbol]
    proc = subprocess.run(
        cmd, cwd=scanner_dir,
        capture_output=True, text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gen_charts.py failed: {proc.stderr[-1000:]}")

    charts = {}
    for tf in ("daily", "weekly", "monthly"):
        path = os.path.join(scanner_dir, "results", "charts", tf, f"{symbol}.png")
        if os.path.isfile(path):
            charts[tf] = path
    return {"charts": charts}
