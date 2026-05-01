"""Auth endpoint contract tests."""
import pytest


# ─── /api/auth/me ─────────────────────────────────────────────────────────────

def test_me_without_token_returns_401(http, base_url):
    r = http.get(f"{base_url}/api/auth/me")
    assert r.status_code == 401


def test_me_with_bad_token_returns_401(http, base_url):
    r = http.get(
        f"{base_url}/api/auth/me",
        headers={"Authorization": "Bearer this.is.not.valid"},
    )
    assert r.status_code == 401


def test_me_with_superadmin_token(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}/api/auth/me", headers=superadmin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "superadmin"
    assert "email" in body
    assert "id" in body


def test_me_response_shape(http, base_url, superadmin_headers):
    body = http.get(f"{base_url}/api/auth/me", headers=superadmin_headers).json()
    assert set(body.keys()) >= {"id", "email", "role", "canton_code"}


# ─── /api/auth/login ──────────────────────────────────────────────────────────

def test_login_wrong_password_returns_401(http, base_url):
    r = http.post(
        f"{base_url}/api/auth/login",
        json={"email": "notareal@user.ch", "password": "wrongpassword"},
    )
    assert r.status_code == 401


def test_login_missing_fields_returns_422(http, base_url):
    r = http.post(f"{base_url}/api/auth/login", json={"email": "x@x.com"})
    assert r.status_code == 422


# ─── /api/auth/refresh ────────────────────────────────────────────────────────

def test_refresh_without_cookie_returns_401(http, base_url):
    """No refresh_token cookie → must fail."""
    s_no_cookie = http.__class__()  # fresh session, no cookies
    r = s_no_cookie.post(f"{base_url}/api/auth/refresh", timeout=5)
    assert r.status_code in (401, 422)


# ─── /api/auth/users (canton_admin+ required) ─────────────────────────────────

def test_list_users_without_token_returns_401(http, base_url):
    r = http.get(f"{base_url}/api/auth/users")
    assert r.status_code == 401


def test_list_users_superadmin_sees_all(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}/api/auth/users", headers=superadmin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) > 0


def test_list_users_response_shape(http, base_url, superadmin_headers):
    users = http.get(f"{base_url}/api/auth/users", headers=superadmin_headers).json()
    u = users[0]
    assert "id" in u
    assert "email" in u
    assert "role" in u
    assert "is_active" in u
