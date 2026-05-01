"""
User management endpoint tests.

Covers:
  - GET  /api/auth/users        — canton_admin scope, canton_viewer blocked
  - DELETE /api/auth/users/{id} — auth enforcement, self-delete, cross-canton,
                                   role restrictions, and successful deletion
  - POST /api/auth/invite-user          — error cases (no email sent)
  - POST /api/auth/create-canton-admin  — error cases (no email sent)
"""
import uuid
import pytest

BASE = "/api/auth"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _create_temp_canton_viewer(canton_code: str) -> dict:
    """Insert a temp canton_viewer into the DB; returns the row dict."""
    from database import with_conn, init_pool
    from services.auth_service import hash_password

    init_pool()
    email = f"pytest-temp-viewer-{uuid.uuid4().hex[:8]}@test.invalid"

    def run(conn, cur):
        cur.execute(
            "INSERT INTO auth.users (email, canton_code, role, is_active, password_hash) "
            "VALUES (%s, %s, 'canton_viewer', true, %s) "
            "RETURNING id, email, canton_code, role",
            (email, canton_code, hash_password("Temp1234!")),
        )
        return dict(cur.fetchone())

    return with_conn(run)


def _delete_user_by_email(email: str) -> None:
    """Remove a user by email (idempotent, used in teardown)."""
    from database import with_conn

    def run(conn, cur):
        cur.execute("DELETE FROM auth.users WHERE email = %s", (email,))

    with_conn(run)


# ─── GET /api/auth/users — access control & canton scoping ───────────────────

def test_list_users_canton_viewer_returns_403(http, base_url, canton_viewer_headers):
    r = http.get(f"{base_url}{BASE}/users", headers=canton_viewer_headers)
    assert r.status_code == 403


def test_list_users_canton_admin_returns_200(http, base_url, canton_admin_headers):
    r = http.get(f"{base_url}{BASE}/users", headers=canton_admin_headers)
    assert r.status_code == 200


def test_list_users_canton_admin_sees_only_own_canton(
    http, base_url, canton_admin_headers, canton_admin_canton_code
):
    users = http.get(f"{base_url}{BASE}/users", headers=canton_admin_headers).json()
    assert isinstance(users, list)
    assert len(users) > 0
    for u in users:
        assert u["canton_code"] == canton_admin_canton_code, (
            f"canton_admin saw user from canton {u['canton_code']!r}, "
            f"expected only {canton_admin_canton_code!r}"
        )


# ─── DELETE /api/auth/users/{id} — auth enforcement ─────────────────────────

def test_delete_user_requires_auth(http, base_url):
    r = http.delete(f"{base_url}{BASE}/users/1")
    assert r.status_code == 401


def test_delete_user_canton_viewer_returns_403(http, base_url, canton_viewer_headers):
    r = http.delete(f"{base_url}{BASE}/users/1", headers=canton_viewer_headers)
    assert r.status_code == 403


# ─── DELETE — edge-case rules ─────────────────────────────────────────────────

def test_delete_nonexistent_user_returns_404(http, base_url, superadmin_headers):
    r = http.delete(f"{base_url}{BASE}/users/999999999", headers=superadmin_headers)
    assert r.status_code == 404


def test_delete_self_returns_400(http, base_url, superadmin_headers, superadmin_id):
    r = http.delete(f"{base_url}{BASE}/users/{superadmin_id}", headers=superadmin_headers)
    assert r.status_code == 400
    assert "own account" in r.json()["detail"].lower()


def test_canton_admin_delete_user_in_other_canton_returns_403(
    http, base_url, canton_admin_headers, canton_admin_canton_code
):
    """canton_admin must not delete a user that belongs to a different canton."""
    from database import with_conn, init_pool
    init_pool()

    # Find a canton that is NOT the canton_admin's canton
    def find_other_canton(conn, cur):
        cur.execute(
            "SELECT id FROM auth.users WHERE canton_code != %s AND canton_code IS NOT NULL LIMIT 1",
            (canton_admin_canton_code,),
        )
        return cur.fetchone()

    other = with_conn(find_other_canton)
    if not other:
        pytest.skip("No user in a different canton found in DB")

    r = http.delete(f"{base_url}{BASE}/users/{other['id']}", headers=canton_admin_headers)
    assert r.status_code == 403


def test_canton_admin_delete_canton_admin_returns_403(
    http, base_url, canton_admin_headers, canton_admin_canton_code
):
    """canton_admin must not delete another canton_admin (even in own canton)."""
    from database import with_conn, init_pool
    init_pool()

    def find_other_canton_admin(conn, cur):
        cur.execute(
            "SELECT id FROM auth.users "
            "WHERE role = 'canton_admin' AND canton_code = %s LIMIT 2",
            (canton_admin_canton_code,),
        )
        rows = cur.fetchall()
        # Need two canton_admins; if only one, we can't test this
        return rows if len(rows) >= 2 else None

    rows = with_conn(find_other_canton_admin)
    if not rows:
        pytest.skip("Need at least two canton_admins in the same canton for this test")

    target_id = rows[1]["id"]
    r = http.delete(f"{base_url}{BASE}/users/{target_id}", headers=canton_admin_headers)
    assert r.status_code == 403


# ─── DELETE — successful paths ────────────────────────────────────────────────

def test_superadmin_can_delete_canton_viewer(
    http, base_url, superadmin_headers, canton_admin_canton_code
):
    user = _create_temp_canton_viewer(canton_admin_canton_code)
    r = http.delete(f"{base_url}{BASE}/users/{user['id']}", headers=superadmin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    # Confirm gone: a second DELETE must 404
    r2 = http.delete(f"{base_url}{BASE}/users/{user['id']}", headers=superadmin_headers)
    assert r2.status_code == 404


def test_canton_admin_can_delete_canton_viewer_in_own_canton(
    http, base_url, canton_admin_headers, canton_admin_canton_code
):
    user = _create_temp_canton_viewer(canton_admin_canton_code)
    try:
        r = http.delete(f"{base_url}{BASE}/users/{user['id']}", headers=canton_admin_headers)
        assert r.status_code == 200
        assert r.json()["ok"] is True
    finally:
        # Idempotent cleanup in case the API call failed
        _delete_user_by_email(user["email"])


# ─── POST /api/auth/invite-user — error cases ────────────────────────────────

def test_invite_user_requires_auth(http, base_url):
    r = http.post(
        f"{base_url}{BASE}/invite-user",
        json={"email": "x@test.invalid", "role": "canton_viewer"},
    )
    assert r.status_code == 401


def test_invite_user_canton_viewer_returns_403(http, base_url, canton_viewer_headers):
    r = http.post(
        f"{base_url}{BASE}/invite-user",
        json={"email": "x@test.invalid", "role": "canton_viewer"},
        headers=canton_viewer_headers,
    )
    assert r.status_code == 403


def test_invite_user_superadmin_without_canton_returns_400(
    http, base_url, superadmin_headers
):
    """Superadmin has no canton_code; invite-user must reject with 400."""
    r = http.post(
        f"{base_url}{BASE}/invite-user",
        json={"email": "pytest-no-canton-invite@example.com", "role": "canton_viewer"},
        headers=superadmin_headers,
    )
    assert r.status_code == 400


def test_invite_user_invalid_role_returns_422(http, base_url, canton_admin_headers):
    r = http.post(
        f"{base_url}{BASE}/invite-user",
        json={"email": "x@test.invalid", "role": "superadmin"},
        headers=canton_admin_headers,
    )
    assert r.status_code == 422


def test_invite_user_duplicate_email_returns_409(
    http, base_url, canton_admin_headers
):
    """Inviting an email that already exists in the DB must return 409."""
    from database import with_conn, init_pool
    init_pool()

    def first_user_email(conn, cur):
        cur.execute("SELECT email FROM auth.users LIMIT 1")
        row = cur.fetchone()
        return row["email"] if row else None

    existing_email = with_conn(first_user_email)
    if not existing_email:
        pytest.skip("No users in DB to test duplicate invite")

    r = http.post(
        f"{base_url}{BASE}/invite-user",
        json={"email": existing_email, "role": "canton_viewer"},
        headers=canton_admin_headers,
    )
    assert r.status_code == 409


# ─── POST /api/auth/create-canton-admin — error cases ───────────────────────

def test_create_canton_admin_requires_auth(http, base_url):
    r = http.post(
        f"{base_url}{BASE}/create-canton-admin",
        json={"email": "x@test.invalid", "canton_code": "ZH"},
    )
    assert r.status_code == 401


def test_create_canton_admin_canton_admin_returns_403(
    http, base_url, canton_admin_headers
):
    r = http.post(
        f"{base_url}{BASE}/create-canton-admin",
        json={"email": "x@test.invalid", "canton_code": "ZH"},
        headers=canton_admin_headers,
    )
    assert r.status_code == 403


def test_create_canton_admin_canton_viewer_returns_403(
    http, base_url, canton_viewer_headers
):
    r = http.post(
        f"{base_url}{BASE}/create-canton-admin",
        json={"email": "x@test.invalid", "canton_code": "ZH"},
        headers=canton_viewer_headers,
    )
    assert r.status_code == 403


def test_create_canton_admin_invalid_canton_returns_404(
    http, base_url, superadmin_headers
):
    r = http.post(
        f"{base_url}{BASE}/create-canton-admin",
        json={"email": "pytest-newadmin@example.com", "canton_code": "INVALID_CANTON_XX"},
        headers=superadmin_headers,
    )
    assert r.status_code == 404


def test_create_canton_admin_duplicate_email_returns_409(
    http, base_url, superadmin_headers, canton_admin_canton_code
):
    from database import with_conn, init_pool
    init_pool()

    def first_user_email(conn, cur):
        cur.execute("SELECT email FROM auth.users LIMIT 1")
        row = cur.fetchone()
        return row["email"] if row else None

    existing_email = with_conn(first_user_email)
    if not existing_email:
        pytest.skip("No users in DB to test duplicate create-canton-admin")

    r = http.post(
        f"{base_url}{BASE}/create-canton-admin",
        json={"email": existing_email, "canton_code": canton_admin_canton_code},
        headers=superadmin_headers,
    )
    assert r.status_code == 409
