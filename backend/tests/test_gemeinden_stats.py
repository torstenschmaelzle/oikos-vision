"""
Tests for GET /gemeinden/{bfs_nummer}/stats
       and GET /gemeinden/{bfs_nummer}/filter-options
"""
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def bfs(http, base_url):
    """Pick the first Gemeinde that has address data (stats will be non-trivial)."""
    cantons = http.get(f"{base_url}/api/cantons").json()
    assert cantons
    gemeinden = http.get(
        f"{base_url}/api/gemeinden", params={"canton_id": cantons[0]["id"]}
    ).json()
    assert gemeinden
    return gemeinden[0]["bfs_nummer"]


# ── /gemeinden/{bfs_nummer}/stats ─────────────────────────────────────────────

def test_stats_returns_200(http, base_url, bfs):
    r = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20)
    assert r.status_code == 200


def test_stats_invalid_bfs_returns_404(http, base_url):
    r = http.get(f"{base_url}/api/gemeinden/999999999/stats", timeout=10)
    assert r.status_code == 404


def test_stats_top_level_keys(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    for key in ("gemeinde", "buildings", "solar_potential",
                "renovation_targets", "by_energy_source",
                "by_building_class", "by_baujahr_era"):
        assert key in body, f"Missing top-level key: {key}"


def test_stats_gemeinde_shape(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    g = body["gemeinde"]
    assert "bfs_nummer" in g
    assert "name" in g
    assert "canton_code" in g


def test_stats_buildings_counts_are_non_negative(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    b = body["buildings"]
    assert b["total"] >= 0
    assert b["with_roof_data"] >= 0
    assert b["with_roof_data"] <= b["total"]
    assert 0.0 <= b["coverage_pct"] <= 100.0


def test_stats_solar_potential_shape(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    sp = body["solar_potential"]
    assert "total_kwh_year" in sp
    assert "avg_roof_area_m2" in sp
    assert "avg_kwh_per_building" in sp
    assert sp["total_kwh_year"] >= 0


def test_stats_renovation_targets_shape(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    rt = body["renovation_targets"]
    assert "fossil_fuel_buildings" in rt
    assert "fossil_pre1980_buildings" in rt
    assert "pre1980_buildings" in rt
    # fossil_pre1980 can't exceed total fossil count
    assert rt["fossil_pre1980_buildings"] <= rt["fossil_fuel_buildings"]


def test_stats_by_energy_source_is_list(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    es = body["by_energy_source"]
    assert isinstance(es, list)


def test_stats_energy_source_items_have_required_fields(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    for item in body["by_energy_source"]:
        assert "genh1" in item
        assert "label" in item
        assert "buildings" in item
        assert "pct" in item
        assert item["buildings"] > 0
        assert 0.0 <= item["pct"] <= 100.0


def test_stats_by_building_class_is_list(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    assert isinstance(body["by_building_class"], list)


def test_stats_baujahr_era_all_keys_present(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    eras = {item["era"] for item in body["by_baujahr_era"]}
    expected = {"pre-1919", "1920-1945", "1946-1980", "1981-2000", "2001-2010", "2011+", "unknown"}
    assert eras == expected


def test_stats_baujahr_era_counts_non_negative(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/stats", timeout=20).json()
    for item in body["by_baujahr_era"]:
        assert item["buildings"] >= 0


# ── /gemeinden/{bfs_nummer}/filter-options ────────────────────────────────────

def test_filter_options_returns_200(http, base_url, bfs):
    r = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60)
    assert r.status_code == 200


def test_filter_options_invalid_bfs_returns_404(http, base_url):
    r = http.get(f"{base_url}/api/gemeinden/999999999/filter-options", timeout=10)
    assert r.status_code == 404


def test_filter_options_top_level_keys(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    for key in ("bfs_nummer", "gemeinde_name", "sb_objektart",
                "gkat", "gklas", "genh1", "baujahr_range", "ggesh_range"):
        assert key in body, f"Missing key: {key}"


def test_filter_options_bfs_nummer_matches(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    assert body["bfs_nummer"] == bfs


def test_filter_options_lists_are_non_empty(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    # At minimum gkat and gklas should have at least one entry
    assert len(body["gkat"]) > 0
    assert len(body["gklas"]) > 0


def test_filter_options_items_have_code_label_buildings(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    for section in ("sb_objektart", "gkat", "gklas", "genh1"):
        for item in body[section]:
            assert "code" in item, f"{section} item missing 'code'"
            assert "label" in item, f"{section} item missing 'label'"
            assert "buildings" in item, f"{section} item missing 'buildings'"
            assert item["buildings"] > 0


def test_filter_options_baujahr_range_shape(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    br = body["baujahr_range"]
    assert "min" in br and "max" in br
    if br["min"] is not None and br["max"] is not None:
        assert br["min"] <= br["max"]


def test_filter_options_ggesh_range_shape(http, base_url, bfs):
    body = http.get(f"{base_url}/api/gemeinden/{bfs}/filter-options", timeout=60).json()
    gr = body["ggesh_range"]
    assert "min" in gr and "max" in gr
    if gr["min"] is not None and gr["max"] is not None:
        assert gr["min"] <= gr["max"]
        assert gr["min"] >= 1
