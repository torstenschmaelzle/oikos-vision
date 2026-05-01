"""
Login and token-refresh happy-path tests.

A disposable test user is created in the DB at module setup and deleted on
teardown, so no real credentials are stored in the test suite.
"""
import http.cookiejar as _cookiejar

import pytest
import requests as _requests

BASE = "/api/auth"


# ─── Session helper ───────────────────────────────────────────────────────────

def _make_session() -> _requests.Session:
    """
    Session that sends secure cookies over HTTP.

    The live server sets refresh_token with secure=True; the standard
    http.cookiejar.DefaultCookiePolicy refuses to send secure cookies back
    over plain HTTP (our test URL).  The permissive policy below lifts that
    restriction so refresh/logout tests work without HTTPS.
    """
    class _AllowSecure(_cookiejar.DefaultCookiePolicy):
        """Allow secure cookies over plain HTTP (needed when test server is HTTP)."""
        def set_ok_secure(self, cookie, request):
            return True  # allow storing secure cookies from HTTP responses

        def return_ok_secure(self, cookie, request):
            return True  # allow sending secure cookies to HTTP endpoints

    s = _requests.Session()
    s.cookies.set_policy(_AllowSecure())
    s.request = lambda method, url, **kw: _requests.Session.request(  # type: ignore[method-assign]
        s, method, url, timeout=kw.pop("timeout", 5), **kw
    )
    return s


# ─── Module-scoped test user ──────────────────────────────────────────────────

@pytest.fixture(scope="module")
def login_user():
    """Create a temp active user with a known password; delete on teardown."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

    from database import with_conn, init_pool
    from services.auth_service import hash_password

    init_pool()

    email = "pytest-login-happy-path@example.com"
    password = "TestLogin99!"

    def setup(conn, cur):
        # Clean up any leftover from a previous interrupted run
        cur.execute("DELETE FROM auth.audit_log WHERE user_id IN (SELECT id FROM auth.users WHERE email = %s)", (email,))
        cur.execute("DELETE FROM auth.refresh_tokens WHERE user_id IN (SELECT id FROM auth.users WHERE email = %s)", (email,))
        cur.execute("DELETE FROM auth.invitation_tokens WHERE user_id IN (SELECT id FROM auth.users WHERE email = %s)", (email,))
        cur.execute("DELETE FROM auth.users WHERE email = %s", (email,))
        cur.execute(
            "INSERT INTO auth.users (email, password_hash, role, is_active) "
            "VALUES (%s, %s, 'superadmin', true) RETURNING id, email, role, canton_code",
            (email, hash_password(password)),
        )
        return dict(cur.fetchone())

    user = with_conn(setup)
    user["password"] = password
    yield user

    def teardown(conn, cur):
        cur.execute("DELETE FROM auth.audit_log WHERE user_id = %s", (user["id"],))
        cur.execute("DELETE FROM auth.refresh_tokens WHERE user_id = %s", (user["id"],))
        cur.execute("DELETE FROM auth.invitation_tokens WHERE user_id = %s", (user["id"],))
        cur.execute("DELETE FROM auth.users WHERE id = %s", (user["id"],))

    with_conn(teardown)


@pytest.fixture(scope="module")
def fresh_session():
    """Isolated session, no shared cookies with the global http fixture."""
    return _make_session()


# ─── POST /api/auth/login ─────────────────────────────────────────────────────

def test_login_returns_200(fresh_session, base_url, login_user):
    r = fresh_session.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    assert r.status_code == 200


def test_login_response_shape(fresh_session, base_url, login_user):
    r = fresh_session.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "user" in body


def test_login_user_shape(fresh_session, base_url, login_user):
    r = fresh_session.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    user = r.json()["user"]
    assert "id" in user
    assert "email" in user
    assert "role" in user
    assert "canton_code" in user
    assert user["email"] == login_user["email"]


def test_login_sets_refresh_cookie(fresh_session, base_url, login_user):
    """Login response must carry a Set-Cookie header with refresh_token."""
    r = fresh_session.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    # r.cookies reflects the Set-Cookie header regardless of policy
    assert "refresh_token" in r.cookies


# ─── POST /api/auth/refresh ───────────────────────────────────────────────────

def _login_and_store_cookie(base_url: str, login_user: dict) -> _requests.Session:
    """
    Login and manually inject the refresh_token cookie into the session jar.

    requests refuses to store/send secure cookies over HTTP even with a custom
    policy, so we extract the raw token from the response and set it directly.
    """
    s = _requests.Session()
    s.request = lambda method, url, **kw: _requests.Session.request(  # type: ignore[method-assign]
        s, method, url, timeout=kw.pop("timeout", 5), **kw
    )
    r = s.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    raw_token = r.cookies.get("refresh_token")
    if raw_token:
        # Set directly on the jar so policy checks are bypassed
        s.cookies.set("refresh_token", raw_token, domain="127.0.0.1", path="/")
    return s


def test_refresh_returns_200(base_url, login_user):
    s = _login_and_store_cookie(base_url, login_user)
    r = s.post(f"{base_url}{BASE}/refresh")
    assert r.status_code == 200


def test_refresh_response_shape(base_url, login_user):
    s = _login_and_store_cookie(base_url, login_user)
    r = s.post(f"{base_url}{BASE}/refresh")
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert "user" in body
    user = body["user"]
    assert "id" in user
    assert "email" in user
    assert "role" in user
    assert "canton_code" in user


def test_refresh_rotates_cookie(base_url, login_user):
    """Each refresh must issue a new Set-Cookie (token rotation)."""
    s = _login_and_store_cookie(base_url, login_user)
    r = s.post(f"{base_url}{BASE}/refresh")
    assert r.status_code == 200
    assert "refresh_token" in r.cookies


# ─── POST /api/auth/logout ────────────────────────────────────────────────────

def test_logout_returns_ok(base_url, login_user):
    """Independent session: login then logout → {ok: true}."""
    s = _make_session()
    s.post(
        f"{base_url}{BASE}/login",
        json={"email": login_user["email"], "password": login_user["password"]},
    )
    r = s.post(f"{base_url}{BASE}/logout")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_refresh_after_logout_returns_401(base_url, login_user):
    """After logout the refresh token is revoked; refresh must fail with 401."""
    s = _login_and_store_cookie(base_url, login_user)
    s.post(f"{base_url}{BASE}/logout")
    r = s.post(f"{base_url}{BASE}/refresh")
    assert r.status_code == 401
