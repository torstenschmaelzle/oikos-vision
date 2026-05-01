"""
Shared fixtures for integration tests.

Loads the service environment file so all app modules (config, database)
see the same variables the live server uses.

Token strategy: mint a short-lived superadmin JWT using the real JWT_SECRET
and a real superadmin user_id from the database. No plaintext credentials
need to be stored anywhere.
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests as _requests

# ─── 1. Load env before any app imports ───────────────────────────────────────
_ENV_FILE = Path("/etc/oikos-api.env")
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

# ─── 2. Make the app package importable ───────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from jose import jwt  # noqa: E402 – must come after sys.path patch

BASE_URL = "http://127.0.0.1:8000"


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mint_token(user_id: int, role: str = "superadmin", canton_code=None) -> str:
    from config import settings
    payload = {
        "sub": str(user_id),
        "role": role,
        "canton_code": canton_code,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _get_superadmin_id() -> int:
    from database import with_conn, init_pool
    init_pool()

    def _q(conn, cur):
        cur.execute(
            "SELECT id FROM auth.users WHERE role = 'superadmin' AND is_active = true LIMIT 1"
        )
        return cur.fetchone()

    row = with_conn(_q)
    if not row:
        pytest.skip("No active superadmin found in DB")
    return row["id"]


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def base_url() -> str:
    return BASE_URL


@pytest.fixture(scope="session")
def http() -> _requests.Session:
    """A requests.Session with a 5-second timeout for all calls."""
    s = _requests.Session()
    s.request = lambda method, url, **kw: _requests.Session.request(  # type: ignore[method-assign]
        s, method, url, timeout=kw.pop("timeout", 5), **kw
    )
    return s


@pytest.fixture(scope="session")
def superadmin_token() -> str:
    return _mint_token(_get_superadmin_id(), role="superadmin")


@pytest.fixture(scope="session")
def superadmin_headers(superadmin_token) -> dict:
    return {"Authorization": f"Bearer {superadmin_token}"}


def _get_canton_admin_row() -> dict:
    """Returns {id, canton_code} of first active canton_admin, skips if none."""
    from database import with_conn, init_pool
    init_pool()

    def _q(conn, cur):
        cur.execute(
            "SELECT id, canton_code FROM auth.users "
            "WHERE role = 'canton_admin' AND is_active = true LIMIT 1"
        )
        return cur.fetchone()

    row = with_conn(_q)
    if not row:
        pytest.skip("No active canton_admin found in DB")
    return dict(row)


def _get_canton_viewer_row() -> dict:
    """Returns {id, canton_code} of first active canton_viewer, skips if none."""
    from database import with_conn, init_pool
    init_pool()

    def _q(conn, cur):
        cur.execute(
            "SELECT id, canton_code FROM auth.users "
            "WHERE role = 'canton_viewer' AND is_active = true LIMIT 1"
        )
        return cur.fetchone()

    row = with_conn(_q)
    if not row:
        pytest.skip("No active canton_viewer found in DB")
    return dict(row)


@pytest.fixture(scope="session")
def _canton_admin_row() -> dict:
    return _get_canton_admin_row()


@pytest.fixture(scope="session")
def canton_admin_token(_canton_admin_row) -> str:
    return _mint_token(
        _canton_admin_row["id"],
        role="canton_admin",
        canton_code=_canton_admin_row["canton_code"],
    )


@pytest.fixture(scope="session")
def canton_admin_headers(canton_admin_token) -> dict:
    return {"Authorization": f"Bearer {canton_admin_token}"}


@pytest.fixture(scope="session")
def canton_admin_canton_code(_canton_admin_row) -> str:
    return _canton_admin_row["canton_code"]


@pytest.fixture(scope="session")
def _canton_viewer_row() -> dict:
    return _get_canton_viewer_row()


@pytest.fixture(scope="session")
def canton_viewer_token(_canton_viewer_row) -> str:
    return _mint_token(
        _canton_viewer_row["id"],
        role="canton_viewer",
        canton_code=_canton_viewer_row["canton_code"],
    )


@pytest.fixture(scope="session")
def canton_viewer_headers(canton_viewer_token) -> dict:
    return {"Authorization": f"Bearer {canton_viewer_token}"}


@pytest.fixture(scope="session")
def superadmin_id() -> int:
    return _get_superadmin_id()
