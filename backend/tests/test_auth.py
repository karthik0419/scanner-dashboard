"""Test auth endpoints: login, register, me, deactivated user rejection."""
import pytest


class TestRegister:
    def test_register_success(self, client):
        """Register a new user → 201 with token."""
        r = client.post("/api/auth/register", json={
            "email": "newuser@test.com",
            "name": "New User",
            "password": "validpass123",
        })
        assert r.status_code == 201
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "newuser@test.com"
        assert data["user"]["role"] == "user"

    def test_register_duplicate_email(self, client, regular_user):
        """Register with existing email → 400."""
        r = client.post("/api/auth/register", json={
            "email": "user@test.com",
            "name": "Dup User",
            "password": "validpass123",
        })
        assert r.status_code == 400

    def test_register_short_password(self, client):
        """Password < 6 chars → 422."""
        r = client.post("/api/auth/register", json={
            "email": "short@test.com",
            "name": "Short",
            "password": "123",
        })
        assert r.status_code == 422

    def test_register_invalid_email(self, client):
        """Invalid email format → 422."""
        r = client.post("/api/auth/register", json={
            "email": "not-an-email",
            "name": "Bad Email",
            "password": "validpass123",
        })
        assert r.status_code == 422

    def test_register_missing_fields(self, client):
        """Missing required fields → 422."""
        r = client.post("/api/auth/register", json={"email": "incomplete@test.com"})
        assert r.status_code == 422


class TestLogin:
    def test_login_success(self, client, regular_user):
        """Valid login → 200 with token."""
        r = client.post("/api/auth/login", json={
            "email": "user@test.com",
            "password": "userpass123",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "user@test.com"

    def test_login_wrong_password(self, client, regular_user):
        """Wrong password → 401."""
        r = client.post("/api/auth/login", json={
            "email": "user@test.com",
            "password": "wrongpassword",
        })
        assert r.status_code == 401

    def test_login_nonexistent_user(self, client):
        """Non-existent email → 401."""
        r = client.post("/api/auth/login", json={
            "email": "nobody@test.com",
            "password": "somepassword",
        })
        assert r.status_code == 401

    def test_login_deactivated_user(self, client, db_session):
        """Deactivated user → 403."""
        from app.models import User
        from app.auth import hash_password
        user = User(
            email="deactivated@test.com",
            name="Deactivated",
            hashed_password=hash_password("somepass123"),
            is_active=False,
        )
        db_session.add(user)
        db_session.commit()

        r = client.post("/api/auth/login", json={
            "email": "deactivated@test.com",
            "password": "somepass123",
        })
        assert r.status_code == 403
        assert "deactivated" in r.json()["detail"].lower()


class TestMe:
    def test_me_with_valid_token(self, client, user_token, auth_headers):
        """GET /api/auth/me with valid token → 200."""
        r = client.get("/api/auth/me", headers=auth_headers(user_token))
        assert r.status_code == 200
        assert r.json()["email"] == "user@test.com"

    def test_me_without_token(self, client):
        """GET /api/auth/me without token → 401."""
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, client):
        """GET /api/auth/me with invalid token → 401."""
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer invalidtoken123"})
        assert r.status_code == 401

    def test_me_returns_role(self, client, admin_token, auth_headers):
        """GET /api/auth/me returns role for admin."""
        r = client.get("/api/auth/me", headers=auth_headers(admin_token))
        assert r.status_code == 200
        assert r.json()["role"] == "admin"
