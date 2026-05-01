"""Canton endpoints — all public."""
import pytest


def test_list_cantons_returns_200(http, base_url):
    r = http.get(f"{base_url}/api/cantons")
    assert r.status_code == 200


def test_list_cantons_is_nonempty_list(http, base_url):
    data = http.get(f"{base_url}/api/cantons").json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_canton_shape(http, base_url):
    cantons = http.get(f"{base_url}/api/cantons").json()
    c = cantons[0]
    assert "id" in c
    assert "code" in c or "canton_code" in c
    assert "name" in c or "canton_name" in c


def test_canton_map_returns_geojson(http, base_url):
    r = http.get(f"{base_url}/api/cantons/map", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("type") == "FeatureCollection"
    assert "features" in body
    assert len(body["features"]) > 0


def test_canton_map_feature_shape(http, base_url):
    r = http.get(f"{base_url}/api/cantons/map", timeout=15)
    feature = r.json()["features"][0]
    assert feature["type"] == "Feature"
    assert "geometry" in feature
    assert "properties" in feature


def test_single_canton_map(http, base_url):
    # Get first canton id from list, then fetch its individual map
    cantons = http.get(f"{base_url}/api/cantons").json()
    canton_id = cantons[0]["id"]
    r = http.get(f"{base_url}/api/cantons/map/{canton_id}", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "geojson" in body


def test_canton_map_invalid_id_returns_404(http, base_url):
    r = http.get(f"{base_url}/api/cantons/map/999999")
    assert r.status_code == 404
