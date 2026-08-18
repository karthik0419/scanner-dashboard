"""Test categories endpoints: CRUD, isolation, normalization, duplicates."""
import pytest


class TestCategoryCRUD:
    def test_create_category(self, client, user_token, auth_headers):
        r = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "My Watchlist", "color": "green"
        })
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "My Watchlist"
        assert data["color"] == "green"
        assert data["is_hidden"] is False
        assert "id" in data

    def test_create_duplicate_category_name(self, client, user_token, auth_headers):
        client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Dup Cat", "color": "blue"
        })
        r = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Dup Cat", "color": "red"
        })
        assert r.status_code == 400

    def test_create_invalid_color(self, client, user_token, auth_headers):
        r = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Bad Color", "color": "rainbow"
        })
        assert r.status_code == 422

    def test_list_categories(self, client, user_token, auth_headers):
        client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "List Test", "color": "indigo"
        })
        r = client.get("/api/categories", headers=auth_headers(user_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_update_category(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Update Me", "color": "blue"
        })
        cat_id = create.json()["id"]

        r = client.patch(f"/api/categories/{cat_id}", headers=auth_headers(user_token), json={
            "color": "red", "name": "Updated Name"
        })
        assert r.status_code == 200
        assert r.json()["color"] == "red"
        assert r.json()["name"] == "Updated Name"

    def test_hide_category(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Hide Me", "color": "purple"
        })
        cat_id = create.json()["id"]

        r = client.patch(f"/api/categories/{cat_id}", headers=auth_headers(user_token), json={
            "is_hidden": True
        })
        assert r.status_code == 200
        assert r.json()["is_hidden"] is True

    def test_list_exclude_hidden(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Hidden Cat", "color": "amber"
        })
        cat_id = create.json()["id"]
        client.patch(f"/api/categories/{cat_id}", headers=auth_headers(user_token), json={"is_hidden": True})

        r = client.get("/api/categories?include_hidden=false", headers=auth_headers(user_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert cat_id not in ids

    def test_delete_category(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Delete Me", "color": "pink"
        })
        cat_id = create.json()["id"]

        r = client.delete(f"/api/categories/{cat_id}", headers=auth_headers(user_token))
        assert r.status_code == 200

    def test_delete_nonexistent_category(self, client, user_token, auth_headers):
        r = client.delete("/api/categories/nonexistent-id", headers=auth_headers(user_token))
        assert r.status_code == 404

    def test_categories_without_token(self, client):
        r = client.get("/api/categories")
        assert r.status_code == 401


class TestCategoryItems:
    def test_add_item(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Items Test", "color": "green"
        })
        cat_id = create.json()["id"]

        r = client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={
            "symbol": "RELIANCE", "note": "test"
        })
        assert r.status_code == 201
        assert r.json()["symbol"] == "RELIANCE"
        assert r.json()["note"] == "test"

    def test_add_item_normalizes_ns_suffix(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Norm Test", "color": "green"
        })
        cat_id = create.json()["id"]

        r = client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={
            "symbol": "RELIANCE.NS"
        })
        assert r.status_code == 201
        assert r.json()["symbol"] == "RELIANCE"

    def test_add_item_normalizes_lowercase(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Lower Test", "color": "green"
        })
        cat_id = create.json()["id"]

        r = client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={
            "symbol": "infy"
        })
        assert r.status_code == 201
        assert r.json()["symbol"] == "INFY"

    def test_add_duplicate_item_normalized(self, client, user_token, auth_headers):
        """RELIANCE.NS and RELIANCE should be treated as duplicates."""
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Dup Item Test", "color": "blue"
        })
        cat_id = create.json()["id"]

        # Add RELIANCE.NS
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={
            "symbol": "RELIANCE.NS"
        })

        # Add RELIANCE (same after normalization) → 400
        r = client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={
            "symbol": "RELIANCE"
        })
        assert r.status_code == 400

    def test_remove_item(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Remove Test", "color": "red"
        })
        cat_id = create.json()["id"]
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={"symbol": "TCS"})

        r = client.delete(f"/api/categories/{cat_id}/items/TCS", headers=auth_headers(user_token))
        assert r.status_code == 200

    def test_remove_nonexistent_item(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Remove Nonexist", "color": "red"
        })
        cat_id = create.json()["id"]

        r = client.delete(f"/api/categories/{cat_id}/items/NOPE", headers=auth_headers(user_token))
        assert r.status_code == 404

    def test_categories_for_symbol(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Symbol Lookup", "color": "indigo"
        })
        cat_id = create.json()["id"]
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={"symbol": "TCS"})

        r = client.get("/api/categories/symbol/TCS", headers=auth_headers(user_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) >= 1

    def test_category_includes_items(self, client, user_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Items Include", "color": "green"
        })
        cat_id = create.json()["id"]
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={"symbol": "INFY"})
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={"symbol": "TCS"})

        r = client.get("/api/categories", headers=auth_headers(user_token))
        cats = [c for c in r.json() if c["id"] == cat_id]
        assert len(cats) == 1
        assert len(cats[0]["items"]) == 2


class TestCategoryIsolation:
    """Per-user isolation: user A's categories invisible to user B."""

    def test_user_cannot_see_others_categories(self, client, user_token, user2_token, auth_headers):
        # User 1 creates a category
        client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "User1 Private", "color": "green"
        })

        # User 2 should not see it
        r = client.get("/api/categories", headers=auth_headers(user2_token))
        names = [c["name"] for c in r.json()]
        assert "User1 Private" not in names

    def test_user_cannot_update_others_category(self, client, user_token, user2_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Isolation Update", "color": "blue"
        })
        cat_id = create.json()["id"]

        r = client.patch(f"/api/categories/{cat_id}", headers=auth_headers(user2_token), json={"color": "red"})
        assert r.status_code == 404

    def test_user_cannot_delete_others_category(self, client, user_token, user2_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Isolation Delete", "color": "blue"
        })
        cat_id = create.json()["id"]

        r = client.delete(f"/api/categories/{cat_id}", headers=auth_headers(user2_token))
        assert r.status_code == 404

    def test_user_cannot_add_item_to_others_category(self, client, user_token, user2_token, auth_headers):
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Isolation Item", "color": "blue"
        })
        cat_id = create.json()["id"]

        r = client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user2_token), json={"symbol": "TCS"})
        assert r.status_code == 404

    def test_symbol_lookup_isolated(self, client, user_token, user2_token, auth_headers):
        """User2's symbol lookup should not return user1's categories."""
        create = client.post("/api/categories", headers=auth_headers(user_token), json={
            "name": "Isolated Symbol", "color": "purple"
        })
        cat_id = create.json()["id"]
        client.post(f"/api/categories/{cat_id}/items", headers=auth_headers(user_token), json={"symbol": "WIPRO"})

        r = client.get("/api/categories/symbol/WIPRO", headers=auth_headers(user2_token))
        assert r.status_code == 200
        assert len(r.json()) == 0
