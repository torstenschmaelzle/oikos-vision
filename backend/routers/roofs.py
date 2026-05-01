
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from config import settings
from database import with_conn
from services.geo_service import require_gemeinde, table_exists
from services.gwr_labels import (
    SB_OBJEKTART_LABELS,
    build_address_filter,
    label_building_row,
)

router = APIRouter(prefix="/roofs", tags=["roofs"])
log = logging.getLogger("oikos")


# ── Lookup ────────────────────────────────────────────────────────────────────

@router.get("/lookup/objektarten")
def list_objektarten():
    """
    All sb_objektart codes with their labels.  Served directly from the
    Python constant — these are Swiss federal standard codes that don't change.
    Used by the frontend to populate the roof-type filter dropdown.
    """
    return {
        "objektarten": [
            {"code": code, "label": label}
            for code, label in sorted(SB_OBJEKTART_LABELS.items())
        ]
    }


# ── Top buildings in a Gemeinde ───────────────────────────────────────────────

@router.get("/top")
def top_roofs_in_gemeinde(
    bfs_nummer: int = Query(..., ge=1),
    limit: int = Query(80, ge=1, le=5000),
    # GWR filters — all optional, multi-value lists use repeated params
    sb_objektart: Optional[List[int]] = Query(None, description="Filter by roof object type code(s)"),
    gkat:         Optional[List[int]] = Query(None, description="GWR building category code(s)"),
    gklas:        Optional[List[int]] = Query(None, description="GWR building class code(s)"),
    genh1:        Optional[List[int]] = Query(None, description="GWR primary energy source code(s)"),
    baujahr_min:  Optional[int]       = Query(None, ge=1000, le=2100, description="Min construction year (gbauj)"),
    baujahr_max:  Optional[int]       = Query(None, ge=1000, le=2100, description="Max construction year (gbauj)"),
    ggesh_min:    Optional[int]       = Query(None, ge=1, description="Min number of floors (ggesh)"),
    ggesh_max:    Optional[int]       = Query(None, ge=1, description="Max number of floors (ggesh)"),
):
    """
    Top buildings by usable roof area in a Gemeinde.

    When GWR filters are active the ranking still uses roof area, but only
    buildings that satisfy every active filter are eligible.  This means you
    always get the best roofs within the filtered pool.

    Response includes GWR fields (gkat, gklas, gbauj, ggesh, genh1, gwaerzh1,
    sb_objektart_code) and their human-readable label counterparts.
    Uses oikos.addresses.com_fosnr for fast index lookups.
    """
    filter_conds, filter_params = build_address_filter(
        gkat=gkat,
        gklas=gklas,
        genh1=genh1,
        baujahr_min=baujahr_min,
        baujahr_max=baujahr_max,
        ggesh_min=ggesh_min,
        ggesh_max=ggesh_max,
        sb_objektart=sb_objektart,
    )
    filter_sql = (" AND " + " AND ".join(filter_conds)) if filter_conds else ""

    # ── Pre-aggregated path (fast) ──────────────────────────────────────────
    # Uses com_fosnr index for the egids CTE — 40x faster than com_name join.
    # params: [bfs_nummer] + filter_params + [limit, bfs_nummer]
    q_with_agg = f"""
    WITH egids AS (
      SELECT DISTINCT a.bdg_egid FROM oikos.addresses a
      WHERE a.bdg_egid IS NOT NULL AND a.com_fosnr = %s{filter_sql}
    ),
    top AS (
      SELECT r.gwr_egid::bigint AS bdg_egid, r.roof_area_sum_m2, r.roof_area_union_m2,
             r.sommer_total, r.winter_total, r.roof_parts_count AS roof_rows
      FROM egids e JOIN oikos.roof_agg_by_egid r ON r.gwr_egid::bigint = e.bdg_egid
      ORDER BY r.roof_area_union_m2 DESC NULLS LAST LIMIT %s
    )
    SELECT
      a.bdg_egid,
      MIN(a.stn_label)  AS stn_label,
      MIN(a.adr_number) AS adr_number,
      MIN(a.zip_label)  AS zip_label,
      MIN(a.com_name)   AS com_name,
      MIN(a.com_canton) AS com_canton,
      t.roof_area_sum_m2, t.roof_area_union_m2, t.sommer_total, t.winter_total, t.roof_rows,
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lat,
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lon,
      MIN(a.gkat)     AS gkat,
      MIN(a.gklas)    AS gklas,
      MIN(a.gbauj)    AS gbauj,
      MIN(a.ggesh)    AS ggesh,
      MIN(a.genh1)    AS genh1,
      MIN(a.gwaerzh1) AS gwaerzh1,
      (SELECT r2.sb_objektart FROM oikos.roofs r2
       WHERE r2.gwr_egid::bigint = a.bdg_egid LIMIT 1) AS sb_objektart_code
    FROM top t JOIN oikos.addresses a ON a.bdg_egid = t.bdg_egid
    WHERE a.com_fosnr = %s
    GROUP BY a.bdg_egid, t.roof_area_sum_m2, t.roof_area_union_m2,
             t.sommer_total, t.winter_total, t.roof_rows
    ORDER BY t.roof_area_union_m2 DESC NULLS LAST;
    """

    # ── Live aggregation fallback (slow) ────────────────────────────────────
    q_live = f"""
    WITH egids AS (
      SELECT DISTINCT a.bdg_egid FROM oikos.addresses a
      WHERE a.bdg_egid IS NOT NULL AND a.com_fosnr = %s{filter_sql}
    ),
    agg AS (
      SELECT r.gwr_egid::bigint AS bdg_egid,
        SUM(ST_Area(r.geom))                             AS roof_area_sum_m2,
        ST_Area(ST_UnaryUnion(ST_Collect(r.geom)))       AS roof_area_union_m2,
        SUM(COALESCE(r.stromertrag_sommerhalbjahr, 0))   AS sommer_total,
        SUM(COALESCE(r.stromertrag_winterhalbjahr, 0))   AS winter_total,
        COUNT(*)                                         AS roof_rows,
        MIN(r.sb_objektart)                              AS sb_objektart_code
      FROM oikos.roofs r JOIN egids e ON e.bdg_egid = r.gwr_egid::bigint
      WHERE r.geom IS NOT NULL AND r.gwr_egid IS NOT NULL
      GROUP BY r.gwr_egid ORDER BY roof_area_union_m2 DESC NULLS LAST LIMIT %s
    )
    SELECT
      a.bdg_egid,
      MIN(a.stn_label)  AS stn_label,
      MIN(a.adr_number) AS adr_number,
      MIN(a.zip_label)  AS zip_label,
      MIN(a.com_name)   AS com_name,
      MIN(a.com_canton) AS com_canton,
      x.roof_area_sum_m2, x.roof_area_union_m2, x.sommer_total, x.winter_total, x.roof_rows,
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lat,
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lon,
      MIN(a.gkat)       AS gkat,
      MIN(a.gklas)      AS gklas,
      MIN(a.gbauj)      AS gbauj,
      MIN(a.ggesh)      AS ggesh,
      MIN(a.genh1)      AS genh1,
      MIN(a.gwaerzh1)   AS gwaerzh1,
      x.sb_objektart_code
    FROM agg x JOIN oikos.addresses a ON a.bdg_egid = x.bdg_egid
    WHERE a.com_fosnr = %s
    GROUP BY a.bdg_egid, x.roof_area_sum_m2, x.roof_area_union_m2,
             x.sommer_total, x.winter_total, x.roof_rows, x.sb_objektart_code
    ORDER BY x.roof_area_union_m2 DESC NULLS LAST;
    """

    active_filters = {k: v for k, v in {
        "sb_objektart": sb_objektart,
        "gkat": gkat,
        "gklas": gklas,
        "genh1": genh1,
        "baujahr_min": baujahr_min,
        "baujahr_max": baujahr_max,
        "ggesh_min": ggesh_min,
        "ggesh_max": ggesh_max,
    }.items() if v is not None}

    def run(_conn, cur):
        g = require_gemeinde(cur, bfs_nummer)
        has_agg = table_exists(cur, "oikos", "roof_agg_by_egid")
        # params: [bfs_nummer] + filter_params + [limit, bfs_nummer]
        params = [bfs_nummer] + filter_params + [limit, bfs_nummer]
        if has_agg:
            cur.execute(q_with_agg, params)
            source = "roof_agg_by_egid"
        else:
            cur.execute(q_live, params)
            source = "live_roofs_aggregation"
        rows = cur.fetchall()
        return {
            "gemeinde": {
                "bfs_nummer": g["bfs_nummer"],
                "name": g["name"],
                "canton_id": g["canton_id"],
                "canton_code": g["canton_code"],
                "canton_name": g["canton_name"],
            },
            "limit": limit,
            "source": source,
            "filters": active_filters,
            "buildings": [label_building_row(dict(r)) for r in rows],
        }

    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("roofs top error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ── Single building roof geometry ─────────────────────────────────────────────

@router.get("/building/{bdg_egid}")
def map_building(bdg_egid: int, include_union: bool = Query(True)):
    q_parts = """
    SELECT objectid, gwr_egid, stromertrag_sommerhalbjahr, stromertrag_winterhalbjahr,
        ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, %s), 4326), %s) AS gj
    FROM oikos.roofs WHERE gwr_egid = %s AND geom IS NOT NULL ORDER BY objectid;
    """
    q_union = """
    SELECT ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_Collect(geom)), %s), 4326), %s) AS gj
    FROM oikos.roofs WHERE gwr_egid = %s AND geom IS NOT NULL;
    """
    def run(_conn, cur):
        cur.execute(q_parts, (settings.ROOF_SIMPLIFY_M, settings.GJ_PRECISION, bdg_egid))
        parts = cur.fetchall()
        union = None
        if include_union:
            cur.execute(q_union, (settings.ROOF_SIMPLIFY_M, settings.GJ_PRECISION, bdg_egid))
            u = cur.fetchone()
            if u and u.get("gj"):
                union = json.loads(u["gj"])
        return {
            "bdg_egid": bdg_egid,
            "simplify_m": settings.ROOF_SIMPLIFY_M,
            "precision": settings.GJ_PRECISION,
            "parts_count": len(parts),
            "union": union,
            "parts": [
                {
                    "objectid": p["objectid"],
                    "gwr_egid": p["gwr_egid"],
                    "summer": p["stromertrag_sommerhalbjahr"],
                    "winter": p["stromertrag_winterhalbjahr"],
                    "geojson": json.loads(p["gj"]) if p.get("gj") else None,
                }
                for p in parts if p.get("gj")
            ],
        }
    try:
        return with_conn(run)
    except Exception:
        log.exception("roofs building error")
        raise HTTPException(status_code=500, detail="Internal server error")
