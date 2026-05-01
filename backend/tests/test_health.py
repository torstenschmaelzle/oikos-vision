"""Health endpoint — public, no auth required."""
import pytest


def test_health_returns_200(http, base_url):
    r = http.get(f"{base_url}/api/health")
    assert r.status_code == 200


def test_health_ok_field(http, base_url):
    body = http.get(f"{base_url}/api/health").json()
    assert body["ok"] is True


def test_health_has_sslmode(http, base_url):
    body = http.get(f"{base_url}/api/health").json()
    assert "sslmode" in body


def test_legacy_health(http, base_url):
    """The /health compat route registered directly on app."""
    r = http.get(f"{base_url}/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True
