"""Test rate limiting: login hammer → 429, scan trigger limit."""
import pytest
import time


class TestLoginRateLimit:
    """Login endpoint: 10/minute per IP."""

    def test_login_rate_limit_triggers_429(self, client, regular_user):
        """Send 12 login attempts; later ones should get 429."""
        codes = []
        for i in range(12):
            r = client.post("/api/auth/login", json={
                "email": "user@test.com",
                "password": "wrongpassword",
            })
            codes.append(r.status_code)

        # Should have at least one 429
        assert 429 in codes, f"No 429 in login rate limit. Codes: {codes}"

    def test_login_rate_limit_allows_valid_within_limit(self, client, regular_user):
        """Valid login within rate limit should succeed."""
        r = client.post("/api/auth/login", json={
            "email": "user@test.com",
            "password": "userpass123",
        })
        assert r.status_code == 200


class TestRegisterRateLimit:
    """Register endpoint: 5/minute per IP."""

    def test_register_rate_limit_triggers_429(self, client):
        """Send 7 register attempts; later ones should get 429."""
        codes = []
        ts = int(time.time())
        for i in range(7):
            r = client.post("/api/auth/register", json={
                "email": f"rl_{ts}_{i}@test.com",
                "name": "Rate Limit Test",
                "password": "validpass123",
            })
            codes.append(r.status_code)

        assert 429 in codes, f"No 429 in register rate limit. Codes: {codes}"


class TestScanTriggerRateLimit:
    """Scan trigger: 10/hour per user (JWT-keyed)."""

    def test_scan_trigger_rate_limit(self, client, user_token, auth_headers):
        """Send 12 scan triggers; after 10, should get 429."""
        codes = []
        for i in range(12):
            r = client.post("/api/scans/trigger", headers=auth_headers(user_token), json={
                "top": 5,
                "min_score": 50,
                "test_mode": True,
            })
            codes.append(r.status_code)
            # Some may be 202 (accepted) or 500 (scanner unavailable)
            # but rate limit should still trigger

        assert 429 in codes, f"No 429 in scan trigger rate limit. Codes: {codes}"

    def test_rate_limit_keyed_by_user(self, client, admin_token, user_token, auth_headers):
        """Rate limit is per-user (JWT-keyed), so admin and user have separate limits."""
        # Exhaust user's scan limit
        for i in range(11):
            client.post("/api/scans/trigger", headers=auth_headers(user_token), json={
                "top": 5, "min_score": 50, "test_mode": True,
            })

        # Admin should still be able to trigger (separate limit)
        r = client.post("/api/scans/trigger", headers=auth_headers(admin_token), json={
            "top": 5, "min_score": 50, "test_mode": True,
        })
        # Should NOT be 429 (admin has its own quota)
        assert r.status_code != 429, "Admin got rate limited by user's quota — limits not JWT-keyed"
