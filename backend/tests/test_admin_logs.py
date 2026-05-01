"""Admin log endpoints — superadmin only."""
import pytest


@pytest.mark.parametrize("log_name", ["app", "auth", "error"])
def test_log_requires_auth(http, base_url, log_name):
    r = http.get(f"{base_url}/api/admin/logs/{log_name}")
    assert r.status_code == 401


@pytest.mark.parametrize("log_name", ["app", "auth", "error"])
def test_log_returns_200(http, base_url, superadmin_headers, log_name):
    r = http.get(f"{base_url}/api/admin/logs/{log_name}", headers=superadmin_headers)
    assert r.status_code == 200


@pytest.mark.parametrize("log_name", ["app", "auth", "error"])
def test_log_response_shape(http, base_url, superadmin_headers, log_name):
    body = http.get(
        f"{base_url}/api/admin/logs/{log_name}", headers=superadmin_headers
    ).json()
    assert "file" in body
    assert "lines" in body
    assert isinstance(body["lines"], list)


def test_app_log_line_shape(http, base_url, superadmin_headers):
    lines = http.get(
        f"{base_url}/api/admin/logs/app", headers=superadmin_headers
    ).json()["lines"]
    if lines:
        line = lines[0]
        assert "timestamp" in line
        assert "level" in line
        assert "message" in line
