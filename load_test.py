"""Locust load test for scanner-dashboard API.

Simulates 100-500 concurrent users hitting a mix of endpoints:
  - login (once per user session)
  - list scans
  - view picks
  - OHLCV chart (cached)
  - list categories
  - market regime

Latency targets:
  - List endpoints: p95 < 500ms
  - Cached OHLCV:   p95 < 200ms

Usage:
  pip install locust
  locust -f load_test.py --host http://localhost:8000

  # Headless run (no web UI):
  locust -f load_test.py --host http://localhost:8000 \
    --headless -u 100 -r 10 -t 60s --csv=load_test_results

  # With 500 users, spawn rate 10/s, run 2 minutes:
  locust -f load_test.py --host http://localhost:8000 \
    --headless -u 500 -r 10 -t 120s --csv=load_test_results
"""
import os
import json
import random
from locust import HttpUser, task, between, events

# ── Credentials ──────────────────────────────────────────────────────────
ADMIN_EMAIL = os.environ.get("LOAD_TEST_ADMIN_EMAIL", "kartik@scanner.io")
ADMIN_PASSWORD = os.environ.get("LOAD_TEST_ADMIN_PASSWORD", "kartik")
GUEST_EMAIL = os.environ.get("LOAD_TEST_GUEST_EMAIL", "guest")
GUEST_PASSWORD = os.environ.get("LOAD_TEST_GUEST_PASSWORD", "guest")

# Symbols to randomly pick for OHLCV requests
SYMBOLS = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "SBIN",
           "BHARTIARTL", "ITC", "LT", "AXISBANK", "WIPRO", "HCLTECH"]

TIMEFRAMES = ["daily", "weekly", "monthly"]


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Log when the test starts."""
    print("=" * 70)
    print("  LOAD TEST — scanner-dashboard v1.1.0")
    print(f"  Target: {environment.host}")
    print(f"  Users: {environment.parsed_options.num_users}")
    print(f"  Spawn rate: {environment.parsed_options.spawn_rate}/s")
    print(f"  Duration: {environment.parsed_options.run_time}")
    print("=" * 70)


class DashboardUser(HttpUser):
    """Simulates a user of the scanner dashboard."""

    # Wait 1-3 seconds between requests (realistic browsing behavior)
    wait_time = between(1, 3)

    def on_start(self):
        """Login when the user session starts — cache the token."""
        # Alternate between admin and guest for variety
        use_admin = random.random() < 0.2  # 20% admin, 80% guest
        if use_admin:
            email, password = ADMIN_EMAIL, ADMIN_PASSWORD
        else:
            email, password = GUEST_EMAIL, GUEST_PASSWORD

        with self.client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
            name="POST /api/auth/login",
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                self.headers = {"Authorization": f"Bearer {self.token}"}
            elif response.status_code == 429:
                # Rate limited — expected under heavy load; mark as success
                response.success()
                self.token = None
                self.headers = {}
            else:
                response.failure(f"Login failed: {response.status_code} {response.text}")
                self.token = None
                self.headers = {}

    def _auth_get(self, path, name=None):
        """GET with auth headers, handling rate limits gracefully."""
        if not self.token:
            return
        with self.client.get(
            path,
            headers=self.headers,
            name=name or path,
            catch_response=True,
        ) as response:
            if response.status_code == 429:
                # Rate limiting under load is expected — don't count as failure
                response.success()
            return response

    @task(3)
    def list_scans(self):
        """List scans — common dashboard view."""
        self._auth_get("/api/scans?limit=20", name="GET /api/scans (list)")

    @task(2)
    def view_picks(self):
        """View picks for a scan — requires a scan ID, use nonexistent to test 404 path."""
        # In a real load test, you'd fetch scan IDs first; here we test the endpoint
        # with a random UUID-like string to exercise the query path
        fake_id = f"load-test-{random.randint(0, 99999)}"
        self._auth_get(f"/api/picks/scan/{fake_id}", name="GET /api/picks/scan (view)")

    @task(4)
    def ohlcv_chart(self):
        """OHLCV chart data — the key interactive chart endpoint (Redis-cached)."""
        symbol = random.choice(SYMBOLS)
        timeframe = random.choice(TIMEFRAMES)
        self._auth_get(
            f"/api/charts/{symbol}/ohlcv?timeframe={timeframe}",
            name="GET /api/charts/{symbol}/ohlcv (cached)",
        )

    @task(2)
    def list_categories(self):
        """List categories — watchlist page."""
        self._auth_get("/api/categories", name="GET /api/categories (list)")

    @task(2)
    def market_regime(self):
        """Market regime — dashboard widget."""
        self._auth_get("/api/market/regime", name="GET /api/market/regime")

    @task(1)
    def tracker_summary(self):
        """Tracker summary — paper trading page."""
        self._auth_get("/api/tracker/summary", name="GET /api/tracker/summary")

    @task(1)
    def list_alerts(self):
        """List alerts — alerts page."""
        self._auth_get("/api/alerts", name="GET /api/alerts (list)")

    @task(1)
    def admin_stats(self):
        """Admin stats — admin dashboard (only works for admin tokens)."""
        self._auth_get("/api/admin/stats", name="GET /api/admin/stats")

    def on_stop(self):
        """Cleanup when user session ends."""
        pass


# ── Custom stats reporting for latency targets ───────────────────────────
@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    """Check p95 latency targets and print a summary."""
    print("\n" + "=" * 70)
    print("  LOAD TEST RESULTS — Latency Analysis")
    print("=" * 70)

    targets = {
        "GET /api/scans (list)": 500,
        "GET /api/categories (list)": 500,
        "GET /api/alerts (list)": 500,
        "GET /api/tracker/summary": 500,
        "GET /api/charts/{symbol}/ohlcv (cached)": 200,
        "GET /api/market/regime": 500,
    }

    for entry in environment.stats.entries:
        name = entry.name
        if name in targets:
            target = targets[name]
            p95 = entry.get_response_time_percentile(0.95)
            if p95 is not None:
                status = "PASS" if p95 < target else "FAIL"
                print(f"  [{status}] {name}: p95={p95:.0f}ms (target <{target}ms)")
            else:
                print(f"  [SKIP] {name}: no response time data")

    print("=" * 70)
