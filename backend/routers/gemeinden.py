
import json
import logging

from fastapi import APIRouter, HTTPException, Query
from config import settings
from database import with_conn
from services.geo_service import geojson_feature_collection, require_canton_id

router = APIRouter(prefix="/gemeinden", tags=["gemeinden"])
log = logging.getLogger("oikos")

@router.get("")
def list_gemeinden(canton_id: int = Query(..., ge=1)):
    def run(_conn, cur):
        require_canton_id(cur, canton_id)
        cur.execute("SELECT bfs_nummer, name, canton_id FROM oikos.gemeinden WHERE canton_id = %s ORDER BY name;", (canton_id,))
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
                "properties": {"bfs_nummer": r["bfs_nummer"], "name": r["name"], "canton_id": r["canton_id"], "canton_code": r["canton_code"]},
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
            raise HTTPException(status_code=404, detail=f"Gemeinde geometry not found for bfs_nummer={bfs_nummer}")
        return {"bfs_nummer": row["bfs_nummer"], "name": row["name"], "canton_id": row["canton_id"], "canton_code": row["canton_code"], "geojson": json.loads(row["gj"])}
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("gemeinden error")
        raise HTTPException(status_code=500, detail="Internal server error")

