
import json
import logging

from fastapi import APIRouter, HTTPException, Query
from config import settings
from database import with_conn
from services.geo_service import require_gemeinde, table_exists

router = APIRouter(prefix="/roofs", tags=["roofs"])
log = logging.getLogger("oikos")

@router.get("/top")
def top_roofs_in_gemeinde(bfs_nummer: int = Query(..., ge=1), limit: int = Query(80, ge=1, le=5000)):
    q_with_agg = """
    WITH g AS (
      SELECT g.bfs_nummer, g.name AS gemeinde_name, c.canton_code, c.canton_name
      FROM oikos.gemeinden g JOIN oikos.cantons c ON c.id = g.canton_id
      WHERE g.bfs_nummer = %s LIMIT 1
    ),
    egids AS (
      SELECT DISTINCT a.bdg_egid FROM oikos.addresses a
      JOIN g ON a.com_name = g.gemeinde_name AND a.com_canton = g.canton_code
      WHERE a.bdg_egid IS NOT NULL
    ),
    top AS (
      SELECT r.gwr_egid::bigint AS bdg_egid, r.roof_area_sum_m2, r.roof_area_union_m2,
             r.sommer_total, r.winter_total, r.roof_parts_count AS roof_rows
      FROM egids e JOIN oikos.roof_agg_by_egid r ON r.gwr_egid::bigint = e.bdg_egid
      ORDER BY r.roof_area_union_m2 DESC NULLS LAST LIMIT %s
    )
    SELECT a.bdg_egid, MIN(a.stn_label) AS stn_label, MIN(a.adr_number) AS adr_number,
      MIN(a.zip_label) AS zip_label, MIN(a.com_name) AS com_name, MIN(a.com_canton) AS com_canton,
      t.roof_area_sum_m2, t.roof_area_union_m2, t.sommer_total, t.winter_total, t.roof_rows,
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lat,
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lon
    FROM top t JOIN oikos.addresses a ON a.bdg_egid = t.bdg_egid
    JOIN oikos.gemeinden g2 ON g2.bfs_nummer = %s
    JOIN oikos.cantons c2 ON c2.id = g2.canton_id AND a.com_name = g2.name AND a.com_canton = c2.canton_code
    GROUP BY a.bdg_egid, t.roof_area_sum_m2, t.roof_area_union_m2, t.sommer_total, t.winter_total, t.roof_rows
    ORDER BY t.roof_area_union_m2 DESC NULLS LAST;
    """
    q_live = """
    WITH g AS (
      SELECT g.bfs_nummer, g.name AS gemeinde_name, c.canton_code
      FROM oikos.gemeinden g JOIN oikos.cantons c ON c.id = g.canton_id
      WHERE g.bfs_nummer = %s LIMIT 1
    ),
    egids AS (
      SELECT DISTINCT a.bdg_egid FROM oikos.addresses a
      JOIN g ON a.com_name = g.gemeinde_name AND a.com_canton = g.canton_code
      WHERE a.bdg_egid IS NOT NULL
    ),
    agg AS (
      SELECT r.gwr_egid::bigint AS bdg_egid, SUM(ST_Area(r.geom)) AS roof_area_sum_m2,
        ST_Area(ST_UnaryUnion(ST_Collect(r.geom))) AS roof_area_union_m2,
        SUM(COALESCE(r.stromertrag_sommerhalbjahr,0)) AS sommer_total,
        SUM(COALESCE(r.stromertrag_winterhalbjahr,0)) AS winter_total, COUNT(*) AS roof_rows
      FROM oikos.roofs r JOIN egids e ON e.bdg_egid = r.gwr_egid::bigint
      WHERE r.geom IS NOT NULL AND r.gwr_egid IS NOT NULL
      GROUP BY r.gwr_egid ORDER BY roof_area_union_m2 DESC NULLS LAST LIMIT %s
    )
    SELECT a.bdg_egid, MIN(a.stn_label) AS stn_label, MIN(a.adr_number) AS adr_number,
      MIN(a.zip_label) AS zip_label, MIN(a.com_name) AS com_name, MIN(a.com_canton) AS com_canton,
      x.roof_area_sum_m2, x.roof_area_union_m2, x.sommer_total, x.winter_total, x.roof_rows,
      ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lat,
      ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)),2056),4326)) AS lon
    FROM agg x JOIN oikos.addresses a ON a.bdg_egid = x.bdg_egid
    JOIN oikos.gemeinden g2 ON g2.bfs_nummer = %s
    JOIN oikos.cantons c2 ON c2.id = g2.canton_id AND a.com_name = g2.name AND a.com_canton = c2.canton_code
    GROUP BY a.bdg_egid, x.roof_area_sum_m2, x.roof_area_union_m2, x.sommer_total, x.winter_total, x.roof_rows
    ORDER BY x.roof_area_union_m2 DESC NULLS LAST;
    """
    def run(_conn, cur):
        g = require_gemeinde(cur, bfs_nummer)
        has_agg = table_exists(cur, "oikos", "roof_agg_by_egid")
        if has_agg:
            cur.execute(q_with_agg, (bfs_nummer, limit, bfs_nummer))
            source = "roof_agg_by_egid"
        else:
            cur.execute(q_live, (bfs_nummer, limit, bfs_nummer))
            source = "live_roofs_aggregation"
        rows = cur.fetchall()
        return {"gemeinde": {"bfs_nummer": g["bfs_nummer"], "name": g["name"], "canton_id": g["canton_id"], "canton_code": g["canton_code"], "canton_name": g["canton_name"]}, "limit": limit, "source": source, "buildings": rows}
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("roofs error")
        raise HTTPException(status_code=500, detail="Internal server error")

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
        return {"bdg_egid": bdg_egid, "simplify_m": settings.ROOF_SIMPLIFY_M, "precision": settings.GJ_PRECISION, "parts_count": len(parts), "union": union,
            "parts": [{"objectid": p["objectid"], "gwr_egid": p["gwr_egid"], "summer": p["stromertrag_sommerhalbjahr"], "winter": p["stromertrag_winterhalbjahr"], "geojson": json.loads(p["gj"]) if p.get("gj") else None} for p in parts if p.get("gj")]}
    try:
        return with_conn(run)
    except Exception:
        log.exception("roofs error")
        raise HTTPException(status_code=500, detail="Internal server error")

