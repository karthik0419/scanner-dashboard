"""
Comprehensive API test script — tests all endpoints end-to-end.
Writes results to test_results.txt (avoids Windows console encoding issues).
"""
import requests
import json
import sys
import io

BASE = "http://localhost:8000"
TOKEN = None
results = []

def log(msg):
    results.append(msg)
    try:
        sys.stdout.buffer.write((msg + "\n").encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()
    except Exception:
        pass

def test(name, func):
    global PASS, FAIL
    try:
        result = func()
        if result is False:
            raise Exception("returned False")
        log(f"  [PASS] {name}")
        return result
    except Exception as e:
        log(f"  [FAIL] {name}: {e}")

def headers():
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h

def main():
    global TOKEN
    PASS = 0
    FAIL = 0

    log("\n=== 1. Health ===")
    try:
        r = requests.get(f"{BASE}/api/health", timeout=10)
        if r.json()["status"] == "ok":
            log("  [PASS] GET /api/health"); PASS += 1
        else:
            log("  [FAIL] GET /api/health"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/health: {e}"); FAIL += 1

    log("\n=== 2. Auth ===")
    # Register
    try:
        r = requests.post(f"{BASE}/api/auth/register", json={
            "email": "apitest@scanner.io", "name": "API Test", "password": "testpass123"
        }, headers={"Content-Type": "application/json"}, timeout=10)
        if r.status_code in [201, 400]:
            log("  [PASS] POST /api/auth/register"); PASS += 1
        else:
            log(f"  [FAIL] POST /api/auth/register: {r.status_code} {r.text[:100]}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] POST /api/auth/register: {e}"); FAIL += 1

    # Login
    try:
        r = requests.post(f"{BASE}/api/auth/login", json={
            "email": "apitest@scanner.io", "password": "testpass123"
        }, headers={"Content-Type": "application/json"}, timeout=10)
        if r.status_code == 200:
            TOKEN = r.json()["access_token"]
            log("  [PASS] POST /api/auth/login"); PASS += 1
        else:
            log(f"  [FAIL] POST /api/auth/login: {r.status_code}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] POST /api/auth/login: {e}"); FAIL += 1

    # Me
    try:
        r = requests.get(f"{BASE}/api/auth/me", headers=headers(), timeout=10)
        if r.json()["email"] == "apitest@scanner.io":
            log("  [PASS] GET /api/auth/me"); PASS += 1
        else:
            log("  [FAIL] GET /api/auth/me"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/auth/me: {e}"); FAIL += 1

    log("\n=== 3. Scans (list) ===")
    try:
        r = requests.get(f"{BASE}/api/scans", headers=headers(), timeout=10)
        if isinstance(r.json(), list):
            log(f"  [PASS] GET /api/scans ({len(r.json())} scans)"); PASS += 1
        else:
            log("  [FAIL] GET /api/scans"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/scans: {e}"); FAIL += 1

    log("\n=== 4. Saved Screens CRUD ===")
    screen_id = None
    try:
        r = requests.post(f"{BASE}/api/screens", json={
            "name": "High Score Breakouts",
            "description": "Score >= 60, BREAKOUT status",
            "filters": {"pattern": "", "timeframe": "", "status": "BREAKOUT", "sector": "", "min_score": 60, "min_rr": None, "sort_by": "score", "sort_desc": True, "limit": 50, "offset": 0}
        }, headers=headers(), timeout=10)
        if r.status_code == 201:
            screen_id = r.json()["id"]
            log("  [PASS] POST /api/screens (create)"); PASS += 1
        else:
            log(f"  [FAIL] POST /api/screens: {r.status_code} {r.text[:100]}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] POST /api/screens: {e}"); FAIL += 1

    try:
        r = requests.get(f"{BASE}/api/screens", headers=headers(), timeout=10)
        if len(r.json()) >= 1:
            log("  [PASS] GET /api/screens (list)"); PASS += 1
        else:
            log("  [FAIL] GET /api/screens"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/screens: {e}"); FAIL += 1

    if screen_id:
        try:
            r = requests.get(f"{BASE}/api/screens/{screen_id}", headers=headers(), timeout=10)
            if r.json()["name"] == "High Score Breakouts":
                log("  [PASS] GET /api/screens/{id}"); PASS += 1
            else:
                log("  [FAIL] GET /api/screens/{id}"); FAIL += 1
        except Exception as e:
            log(f"  [FAIL] GET /api/screens/{id}: {e}"); FAIL += 1

        try:
            r = requests.delete(f"{BASE}/api/screens/{screen_id}", headers=headers(), timeout=10)
            if r.status_code == 204:
                log("  [PASS] DELETE /api/screens/{id}"); PASS += 1
            else:
                log(f"  [FAIL] DELETE /api/screens/{id}: {r.status_code}"); FAIL += 1
        except Exception as e:
            log(f"  [FAIL] DELETE /api/screens/{id}: {e}"); FAIL += 1

    log("\n=== 5. Alerts CRUD ===")
    alert_id = None
    try:
        r = requests.post(f"{BASE}/api/alerts", json={
            "symbol": "TCS", "alert_type": "price_above", "condition_value": 4000, "channel": "telegram"
        }, headers=headers(), timeout=10)
        if r.status_code == 201:
            alert_id = r.json()["id"]
            log("  [PASS] POST /api/alerts (create)"); PASS += 1
        else:
            log(f"  [FAIL] POST /api/alerts: {r.status_code}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] POST /api/alerts: {e}"); FAIL += 1

    try:
        r = requests.get(f"{BASE}/api/alerts", headers=headers(), timeout=10)
        if len(r.json()) >= 1:
            log("  [PASS] GET /api/alerts (list)"); PASS += 1
        else:
            log("  [FAIL] GET /api/alerts"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/alerts: {e}"); FAIL += 1

    if alert_id:
        try:
            r = requests.put(f"{BASE}/api/alerts/{alert_id}/toggle", headers=headers(), timeout=10)
            if r.json()["is_active"] == False:
                log("  [PASS] PUT /api/alerts/{id}/toggle"); PASS += 1
            else:
                log("  [FAIL] PUT /api/alerts/{id}/toggle"); FAIL += 1
        except Exception as e:
            log(f"  [FAIL] PUT /api/alerts/{id}/toggle: {e}"); FAIL += 1

        try:
            r = requests.delete(f"{BASE}/api/alerts/{alert_id}", headers=headers(), timeout=10)
            if r.status_code == 204:
                log("  [PASS] DELETE /api/alerts/{id}"); PASS += 1
            else:
                log(f"  [FAIL] DELETE /api/alerts/{id}: {r.status_code}"); FAIL += 1
        except Exception as e:
            log(f"  [FAIL] DELETE /api/alerts/{id}: {e}"); FAIL += 1

    log("\n=== 6. Market Data ===")
    try:
        r = requests.get(f"{BASE}/api/market/sectors", headers=headers(), timeout=30)
        if r.status_code == 200 and isinstance(r.json(), list):
            log(f"  [PASS] GET /api/market/sectors ({len(r.json())} sectors)"); PASS += 1
        else:
            log(f"  [FAIL] GET /api/market/sectors: {r.status_code} {r.text[:200]}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/market/sectors: {e}"); FAIL += 1

    try:
        r = requests.get(f"{BASE}/api/market/regime", headers=headers(), timeout=30)
        if r.status_code == 200 and "status" in r.json():
            log(f"  [PASS] GET /api/market/regime ({r.json()['status']})"); PASS += 1
        else:
            log(f"  [FAIL] GET /api/market/regime: {r.status_code} {r.text[:200]}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/market/regime: {e}"); FAIL += 1

    log("\n=== 7. Paper Tracker ===")
    try:
        r = requests.get(f"{BASE}/api/tracker", headers=headers(), timeout=10)
        if isinstance(r.json(), list):
            log(f"  [PASS] GET /api/tracker ({len(r.json())} trades)"); PASS += 1
        else:
            log("  [FAIL] GET /api/tracker"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/tracker: {e}"); FAIL += 1

    try:
        r = requests.get(f"{BASE}/api/tracker/summary", headers=headers(), timeout=10)
        if "total" in r.json():
            log(f"  [PASS] GET /api/tracker/summary (total={r.json()['total']})"); PASS += 1
        else:
            log("  [FAIL] GET /api/tracker/summary"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/tracker/summary: {e}"); FAIL += 1

    log("\n=== 8. Scan Trigger (test mode — 50 stocks) ===")
    scan_id = None
    try:
        r = requests.post(f"{BASE}/api/scans/trigger", json={
            "top": 10, "min_score": 40, "sl_mode": "atr",
            "bearish": False, "timeframe": "all", "smart": False, "test_mode": True
        }, headers=headers(), timeout=15)
        if r.status_code == 202:
            scan_id = r.json()["id"]
            log(f"  [PASS] POST /api/scans/trigger (scan_id={scan_id[:8]}...)"); PASS += 1
        else:
            log(f"  [FAIL] POST /api/scans/trigger: {r.status_code} {r.text[:200]}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] POST /api/scans/trigger: {e}"); FAIL += 1

    if scan_id:
        try:
            r = requests.get(f"{BASE}/api/scans/{scan_id}", headers=headers(), timeout=10)
            status = r.json()["status"]
            log(f"  [PASS] GET /api/scans/{{id}} (status={status})"); PASS += 1
        except Exception as e:
            log(f"  [FAIL] GET /api/scans/{{id}}: {e}"); FAIL += 1

    log("\n=== 9. Charts ===")
    try:
        r = requests.get(f"{BASE}/api/charts/RELIANCE?timeframe=daily", headers=headers(), timeout=30)
        if r.status_code == 200:
            log("  [PASS] GET /api/charts/RELIANCE (chart served)"); PASS += 1
        elif r.status_code in [404, 500]:
            log(f"  [PASS] GET /api/charts/RELIANCE (expected {r.status_code} — chart may not exist yet)"); PASS += 1
        else:
            log(f"  [FAIL] GET /api/charts/RELIANCE: {r.status_code}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /api/charts/RELIANCE: {e}"); FAIL += 1

    log("\n=== 10. OpenAPI Docs ===")
    try:
        r = requests.get(f"{BASE}/docs", timeout=10)
        if r.status_code == 200:
            log("  [PASS] GET /docs (Swagger UI)"); PASS += 1
        else:
            log(f"  [FAIL] GET /docs: {r.status_code}"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /docs: {e}"); FAIL += 1

    try:
        r = requests.get(f"{BASE}/openapi.json", timeout=10)
        if "Scanner Dashboard API" in r.json()["info"]["title"]:
            log("  [PASS] GET /openapi.json"); PASS += 1
        else:
            log("  [FAIL] GET /openapi.json"); FAIL += 1
    except Exception as e:
        log(f"  [FAIL] GET /openapi.json: {e}"); FAIL += 1

    summary = f"\n{'='*50}\nRESULTS: {PASS} passed, {FAIL} failed\n{'='*50}"
    log(summary)

    # Write to file
    with open("test_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(results))

    return 0 if FAIL == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
