"""
Tests for the GWR-filtered /roofs/top endpoint and /roofs/lookup/objektarten.

Uses a real bfs_nummer resolved at session scope so tests are data-independent.
"""
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def bfs(http, base_url):
    """Pick the first Gemeinde that has at least one building with roof data."""
    cantons = http.get(f"{base_url}/api/cantons", timeout=15).json()
    assert isinstance(cantons, list) and cantons, "No cantons in DB"
    for canton in cantons:
        gemeinden = http.get(
            f"{base_url}/api/gemeinden",
            params={"canton_id": canton["id"]},
            timeout=15,
        ).json()
        for g in gemeinden:
            r = http.get(
                f"{base_url}/api/roofs/top",
                params={"bfs_nummer": g["bfs_nummer"], "limit": 1},
                timeout=15,
            )
            if r.status_code == 200 and r.json().get("buildings"):
                return g["bfs_nummer"]
    pytest.skip("No Gemeinde with roof data found")


@pytest.fixture(scope="module")
def sample_building(http, base_url, bfs):
    """First building returned by /roofs/top for the chosen Gemeinde."""
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 1},
        timeout=15,
    )
    assert r.status_code == 200
    buildings = r.json()["buildings"]
    assert buildings, "No buildings returned"
    return buildings[0]


# ── /roofs/lookup/objektarten ─────────────────────────────────────────────────

def test_objektarten_returns_200(http, base_url):
    r = http.get(f"{base_url}/api/roofs/lookup/objektarten")
    assert r.status_code == 200


def test_objektarten_shape(http, base_url):
    body = http.get(f"{base_url}/api/roofs/lookup/objektarten").json()
    assert "objektarten" in body
    assert isinstance(body["objektarten"], list)
    assert len(body["objektarten"]) > 0


def test_objektarten_item_has_code_and_label(http, base_url):
    items = http.get(f"{base_url}/api/roofs/lookup/objektarten").json()["objektarten"]
    first = items[0]
    assert "code" in first
    assert "label" in first
    assert isinstance(first["code"], int)
    assert isinstance(first["label"], str)


def test_objektarten_sorted_by_code(http, base_url):
    items = http.get(f"{base_url}/api/roofs/lookup/objektarten").json()["objektarten"]
    codes = [i["code"] for i in items]
    assert codes == sorted(codes)


# ── /roofs/top — base shape with GWR fields ───────────────────────────────────

def test_top_returns_200(http, base_url, bfs):
    r = http.get(f"{base_url}/api/roofs/top", params={"bfs_nummer": bfs}, timeout=15)
    assert r.status_code == 200


def test_top_response_shape(http, base_url, bfs):
    body = http.get(
        f"{base_url}/api/roofs/top", params={"bfs_nummer": bfs, "limit": 5}, timeout=15
    ).json()
    assert "gemeinde" in body
    assert "buildings" in body
    assert "filters" in body
    assert "source" in body


def test_top_building_has_gwr_fields(sample_building):
    for field in ("gkat", "gklas", "gbauj", "ggesh", "genh1"):
        assert field in sample_building, f"Missing field: {field}"


def test_top_building_has_label_fields(sample_building):
    assert "gkat_label" in sample_building
    assert "gklas_label" in sample_building
    assert "genh1_label" in sample_building
    assert "sb_objektart_code" in sample_building
    assert "sb_objektart_label" in sample_building


def test_top_no_filter_returns_empty_filters_dict(http, base_url, bfs):
    body = http.get(
        f"{base_url}/api/roofs/top", params={"bfs_nummer": bfs, "limit": 1}, timeout=15
    ).json()
    assert body["filters"] == {}


def test_top_invalid_bfs_returns_404(http, base_url):
    r = http.get(
        f"{base_url}/api/roofs/top", params={"bfs_nummer": 999999999}, timeout=15
    )
    assert r.status_code == 404


def test_top_missing_bfs_returns_422(http, base_url):
    r = http.get(f"{base_url}/api/roofs/top", timeout=10)
    assert r.status_code == 422


# ── /roofs/top — GWR filters ──────────────────────────────────────────────────

def test_filter_by_gkat_residential(http, base_url, bfs):
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 20, "gkat": 1020},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["filters"].get("gkat") == [1020]
    for b in body["buildings"]:
        assert b["gkat"] == 1020, f"Expected gkat=1020, got {b['gkat']}"


def test_filter_by_sb_objektart_einzelhaus(http, base_url, bfs):
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 10, "sb_objektart": 1},
        timeout=20,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["filters"].get("sb_objektart") == [1]
    for b in body["buildings"]:
        assert b["sb_objektart_code"] == 1


def test_filter_by_baujahr_range(http, base_url, bfs):
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 20, "baujahr_min": 1946, "baujahr_max": 1980},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["filters"]["baujahr_min"] == 1946
    assert body["filters"]["baujahr_max"] == 1980
    for b in body["buildings"]:
        if b["gbauj"] is not None:
            assert 1946 <= b["gbauj"] <= 1980, f"gbauj {b['gbauj']} outside filter range"


def test_filter_combined_gklas_and_baujahr(http, base_url, bfs):
    """EFH built before 1980 — the canonical renovation-target query."""
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 20, "gklas": 1110, "baujahr_max": 1980},
        timeout=15,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["filters"]["gklas"] == [1110]
    assert body["filters"]["baujahr_max"] == 1980
    for b in body["buildings"]:
        assert b["gklas"] == 1110
        if b["gbauj"] is not None:
            assert b["gbauj"] <= 1980


def test_filter_impossible_returns_empty_buildings(http, base_url, bfs):
    """A filter that can never match should return an empty list, not an error."""
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 10, "baujahr_min": 2200},
        timeout=15,
    )
    assert r.status_code == 200
    assert r.json()["buildings"] == []


def test_filter_result_count_le_limit(http, base_url, bfs):
    limit = 5
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": limit, "gkat": 1020},
        timeout=15,
    )
    assert r.status_code == 200
    assert len(r.json()["buildings"]) <= limit


def test_filter_results_ordered_by_roof_area_desc(http, base_url, bfs):
    r = http.get(
        f"{base_url}/api/roofs/top",
        params={"bfs_nummer": bfs, "limit": 20, "gkat": 1020},
        timeout=15,
    )
    assert r.status_code == 200
    areas = [b["roof_area_union_m2"] for b in r.json()["buildings"] if b["roof_area_union_m2"] is not None]
    assert areas == sorted(areas, reverse=True)
