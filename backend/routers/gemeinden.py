
import json
import logging

from fastapi import APIRouter, HTTPException, Query
from config import settings
from database import with_conn
from services.geo_service import geojson_feature_collection, require_canton_id, require_gemeinde
from services.gwr_labels import (
    FOSSIL_FUEL_GENH1,
    GENH1_LABELS,
    GKAT_LABELS,
    GKLAS_LABELS,
    SB_OBJEKTART_LABELS,
)

router = APIRouter(prefix="/gemeinden", tags=["gemeinden"])
log = logging.getLogger("oikos")


# ── List / map ────────────────────────────────────────────────────────────────

@router.get("")
def list_gemeinden(canton_id: int = Query(..., ge=1)):
    def run(_conn, cur):
        require_canton_id(cur, canton_id)
        cur.execute(
            "SELECT bfs_nummer, name, canton_id FROM oikos.gemeinden WHERE canton_id = %s ORDER BY name;",
            (canton_id,),
        )
        return cur.fetchall()
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinden error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/map")
def map_gemeinden(canton_id: int = Query(..., ge=1)):
    q = """
    SELECT g.bfs_nummer, g.name, g.canton_id, c.canton_code,
        ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(g.geom, %s), 4326), %s) AS gj
    FROM oikos.gemeinden g
    JOIN oikos.cantons c ON c.id = g.canton_id
    WHERE g.canton_id = %s ORDER BY g.name;
    """
    def run(_conn, cur):
        require_canton_id(cur, canton_id)
        cur.execute(q, (settings.SIMPLIFY_GEMEINDEN_M, settings.GJ_PRECISION, canton_id))
        rows = cur.fetchall()
        feats = []
        for r in rows:
            if not r.get("gj"):
                continue
            feats.append({
                "type": "Feature",
                "properties": {
                    "bfs_nummer": r["bfs_nummer"],
                    "name": r["name"],
                    "canton_id": r["canton_id"],
                    "canton_code": r["canton_code"],
                },
                "geometry": json.loads(r["gj"]),
            })
        return geojson_feature_collection(feats)
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinden error")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/map/{bfs_nummer}")
def map_gemeinde(bfs_nummer: int):
    q = """
    SELECT g.bfs_nummer, g.name, g.canton_id, c.canton_code,
        ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(g.geom, %s), 4326), %s) AS gj
    FROM oikos.gemeinden g
    JOIN oikos.cantons c ON c.id = g.canton_id
    WHERE g.bfs_nummer = %s LIMIT 1;
    """
    def run(_conn, cur):
        cur.execute(q, (settings.SIMPLIFY_GEMEINDE_M, settings.GJ_PRECISION, bfs_nummer))
        row = cur.fetchone()
        if not row or not row.get("gj"):
            raise HTTPException(
                status_code=404,
                detail=f"Gemeinde geometry not found for bfs_nummer={bfs_nummer}",
            )
        return {
            "bfs_nummer": row["bfs_nummer"],
            "name": row["name"],
            "canton_id": row["canton_id"],
            "canton_code": row["canton_code"],
            "geojson": json.loads(row["gj"]),
        }
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinden error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/{bfs_nummer}/stats")
def gemeinde_stats(bfs_nummer: int):
    """
    Aggregate statistics for a Gemeinde — useful for dashboard overview cards,
    charts, and renovation-target counting before drilling into individual
    buildings.

    Solar potential figures use oikos.roof_agg_by_egid when available.
    Building counts and GWR distributions always use oikos.addresses directly.
    """
    # ── GWR distribution query ──────────────────────────────────────────────
    # Counts distinct buildings per energy source and building class.
    # Uses com_fosnr index for fast Gemeinde lookup (40x faster than com_name join).
    # COUNT(DISTINCT bdg_egid) handles buildings with multiple address rows.
    q_distributions = """
    SELECT
      a.genh1,
      COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL
      AND a.com_fosnr = %s
      AND a.genh1 IS NOT NULL
    GROUP BY a.genh1
    ORDER BY cnt DESC;
    """

    q_gklas = """
    SELECT
      a.gklas,
      COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL
      AND a.com_fosnr = %s
      AND a.gklas IS NOT NULL
    GROUP BY a.gklas
    ORDER BY cnt DESC;
    """

    # Baujahr era breakdown (single-pass FILTER aggregation)
    q_baujahr = """
    SELECT
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj < 1920)                  AS pre_1919,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj BETWEEN 1920 AND 1945)   AS y1920_1945,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj BETWEEN 1946 AND 1980)   AS y1946_1980,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj BETWEEN 1981 AND 2000)   AS y1981_2000,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj BETWEEN 2001 AND 2010)   AS y2001_2010,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj > 2010)                  AS y2011_plus,
      COUNT(DISTINCT bdg_egid) FILTER (WHERE gbauj IS NULL)                 AS unknown_baujahr
    FROM oikos.addresses
    WHERE bdg_egid IS NOT NULL AND com_fosnr = %s;
    """

    # Main counts + solar potential.  LEFT JOIN to roof_agg_by_egid so we
    # still get building counts even if the agg table is empty or absent.
    q_main = """
    SELECT
      COUNT(DISTINCT a.bdg_egid)                                              AS total_buildings,
      COUNT(DISTINCT a.bdg_egid) FILTER (WHERE r.gwr_egid IS NOT NULL)        AS buildings_with_roofs,
      COALESCE(SUM(r.sommer_total + r.winter_total), 0)                       AS total_solar_kwh_year,
      ROUND(AVG(r.roof_area_union_m2)::numeric, 1)                            AS avg_roof_area_m2,
      ROUND(AVG(a.gbauj) FILTER (
        WHERE a.gbauj BETWEEN 1800 AND 2030
      )::numeric, 0)                                                           AS avg_baujahr,
      COUNT(DISTINCT a.bdg_egid) FILTER (
        WHERE a.genh1 = ANY(%s)
      )                                                                        AS fossil_fuel_buildings,
      COUNT(DISTINCT a.bdg_egid) FILTER (
        WHERE a.genh1 = ANY(%s) AND a.gbauj <= 1980
      )                                                                        AS fossil_pre1980_buildings,
      COUNT(DISTINCT a.bdg_egid) FILTER (
        WHERE a.gbauj BETWEEN 1900 AND 1980
      )                                                                        AS pre1980_buildings
    FROM oikos.addresses a
    LEFT JOIN oikos.roof_agg_by_egid r ON r.gwr_egid::bigint = a.bdg_egid
    WHERE a.bdg_egid IS NOT NULL AND a.com_fosnr = %s;
    """

    def run(_conn, cur):
        g = require_gemeinde(cur, bfs_nummer)

        cur.execute(q_main, (list(FOSSIL_FUEL_GENH1), list(FOSSIL_FUEL_GENH1), bfs_nummer))
        main = cur.fetchone()

        cur.execute(q_distributions, (bfs_nummer,))
        energy_rows = cur.fetchall()

        cur.execute(q_gklas, (bfs_nummer,))
        gklas_rows = cur.fetchall()

        cur.execute(q_baujahr, (bfs_nummer,))
        bj = cur.fetchone()

        total = main["total_buildings"] or 0
        with_roofs = main["buildings_with_roofs"] or 0
        coverage_pct = round(with_roofs / total * 100, 1) if total else 0.0

        energy_breakdown = [
            {
                "genh1": r["genh1"],
                "label": GENH1_LABELS.get(r["genh1"]),
                "buildings": r["cnt"],
                "pct": round(r["cnt"] / total * 100, 1) if total else 0.0,
            }
            for r in energy_rows
        ]

        gklas_breakdown = [
            {
                "gklas": r["gklas"],
                "label": GKLAS_LABELS.get(r["gklas"]),
                "buildings": r["cnt"],
                "pct": round(r["cnt"] / total * 100, 1) if total else 0.0,
            }
            for r in gklas_rows
        ]

        baujahr_eras = [
            {"era": "pre-1919",  "buildings": bj["pre_1919"]  or 0},
            {"era": "1920-1945", "buildings": bj["y1920_1945"] or 0},
            {"era": "1946-1980", "buildings": bj["y1946_1980"] or 0},
            {"era": "1981-2000", "buildings": bj["y1981_2000"] or 0},
            {"era": "2001-2010", "buildings": bj["y2001_2010"] or 0},
            {"era": "2011+",     "buildings": bj["y2011_plus"] or 0},
            {"era": "unknown",   "buildings": bj["unknown_baujahr"] or 0},
        ]

        total_solar = int(main["total_solar_kwh_year"] or 0)
        avg_roof = float(main["avg_roof_area_m2"]) if main["avg_roof_area_m2"] else None
        avg_kwh = round(total_solar / with_roofs) if with_roofs else None

        return {
            "gemeinde": {
                "bfs_nummer": g["bfs_nummer"],
                "name": g["name"],
                "canton_code": g["canton_code"],
                "canton_name": g["canton_name"],
            },
            "buildings": {
                "total": total,
                "with_roof_data": with_roofs,
                "coverage_pct": coverage_pct,
            },
            "solar_potential": {
                "total_kwh_year": total_solar,
                "avg_roof_area_m2": avg_roof,
                "avg_kwh_per_building": avg_kwh,
            },
            "renovation_targets": {
                "fossil_fuel_buildings": int(main["fossil_fuel_buildings"] or 0),
                "fossil_pre1980_buildings": int(main["fossil_pre1980_buildings"] or 0),
                "pre1980_buildings": int(main["pre1980_buildings"] or 0),
            },
            "by_energy_source": energy_breakdown,
            "by_building_class": gklas_breakdown,
            "by_baujahr_era": baujahr_eras,
        }

    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinde stats error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Filter options ────────────────────────────────────────────────────────────

@router.get("/{bfs_nummer}/filter-options")
def gemeinde_filter_options(bfs_nummer: int):
    """
    Filter values that actually exist for buildings in this Gemeinde, with
    counts.  The frontend uses this to populate dropdowns and avoid offering
    filter combinations that would return zero results.

    All queries run in a single connection transaction.
    """
    # All queries use com_fosnr index for fast Gemeinde scoping.
    # q_sb joins FROM addresses (small, indexed by com_fosnr) to roofs —
    # avoids iterating the full 10M-row roofs table.
    q_sb = """
    SELECT r.sb_objektart AS code, COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    JOIN oikos.roofs r ON r.gwr_egid::bigint = a.bdg_egid
    WHERE a.com_fosnr = %s AND r.sb_objektart IS NOT NULL
    GROUP BY r.sb_objektart ORDER BY cnt DESC;
    """

    q_gkat = """
    SELECT a.gkat AS code, COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL AND a.gkat IS NOT NULL AND a.com_fosnr = %s
    GROUP BY a.gkat ORDER BY cnt DESC;
    """

    q_gklas = """
    SELECT a.gklas AS code, COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL AND a.gklas IS NOT NULL AND a.com_fosnr = %s
    GROUP BY a.gklas ORDER BY cnt DESC;
    """

    q_genh1 = """
    SELECT a.genh1 AS code, COUNT(DISTINCT a.bdg_egid) AS cnt
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL AND a.genh1 IS NOT NULL AND a.com_fosnr = %s
    GROUP BY a.genh1 ORDER BY cnt DESC;
    """

    q_ranges = """
    SELECT
      MIN(a.gbauj) FILTER (WHERE a.gbauj BETWEEN 1000 AND 2100) AS baujahr_min,
      MAX(a.gbauj) FILTER (WHERE a.gbauj BETWEEN 1000 AND 2100) AS baujahr_max,
      MIN(a.ggesh) AS ggesh_min,
      MAX(a.ggesh) AS ggesh_max
    FROM oikos.addresses a
    WHERE a.bdg_egid IS NOT NULL AND a.com_fosnr = %s;
    """

    def run(_conn, cur):
        g = require_gemeinde(cur, bfs_nummer)

        cur.execute(q_sb, (bfs_nummer,))
        sb_rows = cur.fetchall()

        cur.execute(q_gkat, (bfs_nummer,))
        gkat_rows = cur.fetchall()

        cur.execute(q_gklas, (bfs_nummer,))
        gklas_rows = cur.fetchall()

        cur.execute(q_genh1, (bfs_nummer,))
        genh1_rows = cur.fetchall()

        cur.execute(q_ranges, (bfs_nummer,))
        ranges = cur.fetchone()

        return {
            "bfs_nummer": bfs_nummer,
            "gemeinde_name": g["name"],
            "sb_objektart": [
                {"code": r["code"], "label": SB_OBJEKTART_LABELS.get(r["code"]), "buildings": r["cnt"]}
                for r in sb_rows
            ],
            "gkat": [
                {"code": r["code"], "label": GKAT_LABELS.get(r["code"]), "buildings": r["cnt"]}
                for r in gkat_rows
            ],
            "gklas": [
                {"code": r["code"], "label": GKLAS_LABELS.get(r["code"]), "buildings": r["cnt"]}
                for r in gklas_rows
            ],
            "genh1": [
                {"code": r["code"], "label": GENH1_LABELS.get(r["code"]), "buildings": r["cnt"]}
                for r in genh1_rows
            ],
            "baujahr_range": {
                "min": ranges["baujahr_min"],
                "max": ranges["baujahr_max"],
            },
            "ggesh_range": {
                "min": ranges["ggesh_min"],
                "max": ranges["ggesh_max"],
            },
        }

    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinde filter-options error")
        raise HTTPException(status_code=500, detail="Internal server error")

