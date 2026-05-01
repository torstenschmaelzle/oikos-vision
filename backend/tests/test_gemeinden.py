"""Gemeinden endpoints — all public."""
import pytest


@pytest.fixture(scope="module")
def first_canton_id(http, base_url):
    cantons = http.get(f"{base_url}/api/cantons").json()
    assert cantons, "No cantons in DB"
    return cantons[0]["id"]


@pytest.fixture(scope="module")
def first_bfs_nummer(http, base_url, first_canton_id):
    gemeinden = http.get(
        f"{base_url}/api/gemeinden", params={"canton_id": first_canton_id}
    ).json()
    assert gemeinden, "No gemeinden for canton"
    return gemeinden[0]["bfs_nummer"]


def test_list_gemeinden_returns_200(http, base_url, first_canton_id):
    r = http.get(f"{base_url}/api/gemeinden", params={"canton_id": first_canton_id})
    assert r.status_code == 200


def test_list_gemeinden_is_list(http, base_url, first_canton_id):
    data = http.get(
        f"{base_url}/api/gemeinden", params={"canton_id": first_canton_id}
    ).json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_gemeinde_shape(http, base_url, first_canton_id):
    gemeinden = http.get(
        f"{base_url}/api/gemeinden", params={"canton_id": first_canton_id}
    ).json()
    g = gemeinden[0]
    assert "bfs_nummer" in g
    assert "name" in g


def test_gemeinden_requires_canton_id(http, base_url):
    r = http.get(f"{base_url}/api/gemeinden")
    assert r.status_code == 422


def test_gemeinden_invalid_canton_returns_404(http, base_url):
    r = http.get(f"{base_url}/api/gemeinden", params={"canton_id": 999999})
    assert r.status_code == 404


def test_gemeinde_map_returns_geojson(http, base_url, first_canton_id):
    r = http.get(
        f"{base_url}/api/gemeinden/map",
        params={"canton_id": first_canton_id},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("type") == "FeatureCollection"


def test_single_gemeinde_map(http, base_url, first_bfs_nummer):
    r = http.get(f"{base_url}/api/gemeinden/map/{first_bfs_nummer}", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "geojson" in body
    assert "bfs_nummer" in body


def test_gemeinde_map_invalid_bfs_returns_404(http, base_url):
    r = http.get(f"{base_url}/api/gemeinden/map/999999999")
    assert r.status_code == 404
