"""Test admin endpoints: RBAC, CRUD, guards (last admin, self-delete), stats."""
import pytest


class TestAdminRBAC:
    """Role-based access control for admin endpoints."""

    def test_admin_can_list_users(self, client, admin_token, auth_headers):
        r = client.get("/api/admin/users", headers=auth_headers(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_regular_user_cannot_list_users(self, client, user_token, auth_headers):
        r = client.get("/api/admin/users", headers=auth_headers(user_token))
        assert r.status_code == 403

    def test_no_token_cannot_list_users(self, client):
        r = client.get("/api/admin/users")
        assert r.status_code == 401

    def test_regular_user_cannot_create_user(self, client, user_token, auth_headers):
        r = client.post("/api/admin/users", headers=auth_headers(user_token), json={
            "email": "hacker@test.com", "name": "Hacker",
            "password": "hackpass123", "role": "admin", "plan": "free",
        })
        assert r.status_code == 403

    def test_regular_user_cannot_get_stats(self, client, user_token, auth_headers):
        r = client.get("/api/admin/stats", headers=auth_headers(user_token))
        assert r.status_code == 403

    def test_regular_user_cannot_delete_user(self, client, user_token, auth_headers, admin_user):
        r = client.delete(f"/api/admin/users/{admin_user.id}", headers=auth_headers(user_token))
        assert r.status_code == 403


class TestAdminUserCRUD:
    """Create, read, update, delete users via admin API."""

    def test_create_user(self, client, admin_token, auth_headers):
        r = client.post("/api/admin/users", headers=auth_headers(admin_token), json={
            "email": "crud@test.com", "name": "CRUD User",
            "password": "crudpass123", "role": "user", "plan": "free",
        })
        assert r.status_code == 201
        data = r.json()
        assert data["email"] == "crud@test.com"
        assert data["role"] == "user"
        assert data["plan"] == "free"
        assert data["is_active"] is True

    def test_create_duplicate_email(self, client, admin_token, auth_headers, regular_user):
        r = client.post("/api/admin/users", headers=auth_headers(admin_token), json={
            "email": "user@test.com", "name": "Dup",
            "password": "duppass123", "role": "user", "plan": "free",
        })
        assert r.status_code == 400

    def test_create_short_password(self, client, admin_token, auth_headers):
        r = client.post("/api/admin/users", headers=auth_headers(admin_token), json={
            "email": "short@test.com", "name": "Short",
            "password": "123", "role": "user", "plan": "free",
        })
        assert r.status_code == 422

    def test_create_admin_role_user(self, client, admin_token, auth_headers):
        r = client.post("/api/admin/users", headers=auth_headers(admin_token), json={
            "email": "newadmin@test.com", "name": "New Admin",
            "password": "adminpass123", "role": "admin", "plan": "pro",
        })
        assert r.status_code == 201
        assert r.json()["role"] == "admin"

    def test_update_user_plan(self, client, admin_token, auth_headers, regular_user):
        r = client.patch(f"/api/admin/users/{regular_user.id}", headers=auth_headers(admin_token), json={
            "plan": "pro"
        })
        assert r.status_code == 200
        assert r.json()["plan"] == "pro"

    def test_update_user_name(self, client, admin_token, auth_headers, regular_user):
        r = client.patch(f"/api/admin/users/{regular_user.id}", headers=auth_headers(admin_token), json={
            "name": "Updated Name"
        })
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"

    def test_update_user_role(self, client, admin_token, auth_headers, regular_user):
        r = client.patch(f"/api/admin/users/{regular_user.id}", headers=auth_headers(admin_token), json={
            "role": "admin"
        })
        assert r.status_code == 200
        assert r.json()["role"] == "admin"

    def test_deactivate_user(self, client, admin_token, auth_headers, regular_user):
        r = client.patch(f"/api/admin/users/{regular_user.id}", headers=auth_headers(admin_token), json={
            "is_active": False
        })
        assert r.status_code == 200
        assert r.json()["is_active"] is False

    def test_update_nonexistent_user(self, client, admin_token, auth_headers):
        r = client.patch("/api/admin/users/nonexistent-id", headers=auth_headers(admin_token), json={
            "plan": "pro"
        })
        assert r.status_code == 404

    def test_reset_password(self, client, admin_token, auth_headers, regular_user):
        r = client.post(f"/api/admin/users/{regular_user.id}/reset-password",
                        headers=auth_headers(admin_token), json={"new_password": "newpass456"})
        assert r.status_code == 200

        # Verify new password works
        r2 = client.post("/api/auth/login", json={
            "email": "user@test.com", "password": "newpass456"
        })
        assert r2.status_code == 200

    def test_reset_password_short(self, client, admin_token, auth_headers, regular_user):
        r = client.post(f"/api/admin/users/{regular_user.id}/reset-password",
                        headers=auth_headers(admin_token), json={"new_password": "123"})
        assert r.status_code == 422

    def test_delete_user(self, client, admin_token, auth_headers, regular_user):
        r = client.delete(f"/api/admin/users/{regular_user.id}", headers=auth_headers(admin_token))
        assert r.status_code == 200

        # Verify user is gone
        r2 = client.get("/api/admin/users", headers=auth_headers(admin_token))
        ids = [u["id"] for u in r2.json()]
        assert regular_user.id not in ids

    def test_delete_nonexistent_user(self, client, admin_token, auth_headers):
        r = client.delete("/api/admin/users/nonexistent-id", headers=auth_headers(admin_token))
        assert r.status_code == 404


class TestAdminGuards:
    """Guard rails: can't delete self, can't demote/deactivate/delete last admin."""

    def test_cannot_delete_self(self, client, admin_token, auth_headers, admin_user):
        r = client.delete(f"/api/admin/users/{admin_user.id}", headers=auth_headers(admin_token))
        assert r.status_code == 400
        assert "own account" in r.json()["detail"].lower()

    def test_cannot_demote_last_admin(self, client, admin_token, auth_headers, admin_user):
        """If only 1 active admin, cannot demote to user."""
        r = client.patch(f"/api/admin/users/{admin_user.id}", headers=auth_headers(admin_token), json={
            "role": "user"
        })
        assert r.status_code == 400
        assert "last active admin" in r.json()["detail"].lower()

    def test_cannot_deactivate_last_admin(self, client, admin_token, auth_headers, admin_user):
        """If only 1 active admin, cannot deactivate."""
        r = client.patch(f"/api/admin/users/{admin_user.id}", headers=auth_headers(admin_token), json={
            "is_active": False
        })
        assert r.status_code == 400
        assert "last active admin" in r.json()["detail"].lower()

    def test_can_demote_non_last_admin(self, client, admin_token, auth_headers, db_session):
        """If 2+ active admins, can demote one."""
        from app.models import User
        from app.auth import hash_password
        admin2 = User(
            email="admin2@test.com", name="Admin Two",
            hashed_password=hash_password("admin2pass1"),
            role="admin", plan="pro", is_active=True,
        )
        db_session.add(admin2)
        db_session.commit()
        db_session.refresh(admin2)

        r = client.patch(f"/api/admin/users/{admin2.id}", headers=auth_headers(admin_token), json={
            "role": "user"
        })
        assert r.status_code == 200
        assert r.json()["role"] == "user"


class TestAdminSearch:
    """Search and pagination."""

    def test_search_by_email(self, client, admin_token, auth_headers, regular_user):
        r = client.get("/api/admin/users?q=user@test", headers=auth_headers(admin_token))
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert "user@test.com" in emails

    def test_filter_by_role(self, client, admin_token, auth_headers, admin_user, regular_user):
        r = client.get("/api/admin/users?role=admin", headers=auth_headers(admin_token))
        assert r.status_code == 200
        for u in r.json():
            assert u["role"] == "admin"

    def test_filter_by_active(self, client, admin_token, auth_headers, admin_user):
        r = client.get("/api/admin/users?active=true", headers=auth_headers(admin_token))
        assert r.status_code == 200
        for u in r.json():
            assert u["is_active"] is True

    def test_pagination(self, client, admin_token, auth_headers):
        r = client.get("/api/admin/users?limit=1&offset=0", headers=auth_headers(admin_token))
        assert r.status_code == 200
        assert len(r.json()) <= 1


class TestAdminStats:
    def test_stats(self, client, admin_token, auth_headers):
        r = client.get("/api/admin/stats", headers=auth_headers(admin_token))
        assert r.status_code == 200
        data = r.json()
        assert "total_users" in data
        assert "active_users" in data
        assert "admin_users" in data
        assert "total_scans" in data
        assert "scans_last_7d" in data
        assert "total_picks" in data
        assert "total_trades" in data
        assert "total_categories" in data
        assert data["total_users"] >= 1
