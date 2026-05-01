"""
Test-runner endpoint tests.

Does NOT trigger an actual run (POST /runs) to avoid recursive test execution.
Tests all read/list/detail endpoints and the access-control enforcement.
"""
import pytest


BASE = "/api/admin/tests"


# ─── Access control ───────────────────────────────────────────────────────────

def test_list_runs_requires_auth(http, base_url):
    r = http.get(f"{base_url}{BASE}/runs")
    assert r.status_code == 401


def test_latest_run_requires_auth(http, base_url):
    r = http.get(f"{base_url}{BASE}/runs/latest")
    assert r.status_code == 401


def test_trigger_requires_auth(http, base_url):
    r = http.post(f"{base_url}{BASE}/runs")
    assert r.status_code == 401


# ─── List runs ────────────────────────────────────────────────────────────────

def test_list_runs_returns_200(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}{BASE}/runs", headers=superadmin_headers)
    assert r.status_code == 200


def test_list_runs_shape(http, base_url, superadmin_headers):
    body = http.get(f"{base_url}{BASE}/runs", headers=superadmin_headers).json()
    assert "runs" in body
    assert "total" in body
    assert "limit" in body
    assert "offset" in body
    assert isinstance(body["runs"], list)
    assert isinstance(body["total"], int)


def test_list_runs_pagination_params(http, base_url, superadmin_headers):
    r = http.get(
        f"{base_url}{BASE}/runs",
        headers=superadmin_headers,
        params={"limit": 5, "offset": 0},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 5
    assert len(body["runs"]) <= 5


def test_list_runs_rejects_bad_limit(http, base_url, superadmin_headers):
    r = http.get(
        f"{base_url}{BASE}/runs",
        headers=superadmin_headers,
        params={"limit": 999},
    )
    assert r.status_code == 422


# ─── Latest run ───────────────────────────────────────────────────────────────

def test_latest_run_returns_200_or_404(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}{BASE}/runs/latest", headers=superadmin_headers)
    assert r.status_code in (200, 404)


def test_latest_run_shape_when_exists(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}{BASE}/runs/latest", headers=superadmin_headers)
    if r.status_code == 404:
        pytest.skip("No runs in DB yet")
    body = r.json()
    for field in ("run_id", "status", "suite", "created_at", "output_available",
                  "failure_names"):
        assert field in body, f"Missing field: {field}"


def test_latest_run_status_is_valid(http, base_url, superadmin_headers):
    r = http.get(f"{base_url}{BASE}/runs/latest", headers=superadmin_headers)
    if r.status_code == 404:
        pytest.skip("No runs in DB yet")
    assert r.json()["status"] in ("queued", "running", "succeeded", "failed")


# ─── Get run by ID ────────────────────────────────────────────────────────────

def test_get_nonexistent_run_returns_404(http, base_url, superadmin_headers):
    r = http.get(
        f"{base_url}{BASE}/runs/00000000-0000-0000-0000-000000000000",
        headers=superadmin_headers,
    )
    assert r.status_code == 404


def test_get_run_by_id(http, base_url, superadmin_headers):
    latest = http.get(f"{base_url}{BASE}/runs/latest", headers=superadmin_headers)
    if latest.status_code == 404:
        pytest.skip("No runs in DB yet")
    run_id = latest.json()["run_id"]
    r = http.get(f"{base_url}{BASE}/runs/{run_id}", headers=superadmin_headers)
    assert r.status_code == 200
    assert r.json()["run_id"] == run_id


# ─── Output endpoint ──────────────────────────────────────────────────────────

def test_output_nonexistent_run_returns_404(http, base_url, superadmin_headers):
    r = http.get(
        f"{base_url}{BASE}/runs/00000000-0000-0000-0000-000000000000/output",
        headers=superadmin_headers,
    )
    assert r.status_code == 404


def test_output_shape_when_available(http, base_url, superadmin_headers):
    latest = http.get(f"{base_url}{BASE}/runs/latest", headers=superadmin_headers)
    if latest.status_code == 404:
        pytest.skip("No runs in DB yet")
    run = latest.json()
    if not run["output_available"]:
        pytest.skip("Latest run has no output yet")
    run_id = run["run_id"]
    r = http.get(f"{base_url}{BASE}/runs/{run_id}/output", headers=superadmin_headers)
    assert r.status_code == 200
    body = r.json()
    assert "run_id" in body
    assert "output" in body
    assert isinstance(body["output"], str)
    assert len(body["output"]) > 0
