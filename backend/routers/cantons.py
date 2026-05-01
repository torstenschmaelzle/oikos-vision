
import json
import logging

from fastapi import APIRouter, HTTPException
from config import settings
from database import with_conn
from services.geo_service import geojson_feature_collection, require_canton_id

router = APIRouter(prefix="/cantons", tags=["cantons"])
log = logging.getLogger("oikos")

@router.get("")
def list_cantons():
    def run(_conn, cur):
        cur.execute("SELECT id, canton_code AS code, canton_name AS name FROM oikos.cantons ORDER BY canton_name;")
        return cur.fetchall()
    try:
        return with_conn(run)
    except Exception:
        log.exception("cantons list_cantons error")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/map")
def map_cantons():
    q = """
    SELECT id, canton_name, canton_code,
        ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, %s), 4326), %s) AS gj
    FROM oikos.cantons ORDER BY canton_name;
    """
    def run(_conn, cur):
        cur.execute(q, (settings.SIMPLIFY_CANTONS_M, settings.GJ_PRECISION))
        rows = cur.fetchall()
        feats = []
        for r in rows:
            if not r.get("gj"):
                continue
            feats.append({
                "type": "Feature",
                "properties": {"id": r["id"], "code": r["canton_code"], "name": r["canton_name"]},
                "geometry": json.loads(r["gj"]),
            })
        return geojson_feature_collection(feats)
    try:
        return with_conn(run)
    except Exception:
        log.exception("cantons map_cantons error")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/map/{canton_id}")
def map_canton(canton_id: int):
    q = """
    SELECT id, canton_name, canton_code,
        ST_AsGeoJSON(ST_Transform(ST_SimplifyPreserveTopology(geom, %s), 4326), %s) AS gj
    FROM oikos.cantons WHERE id = %s LIMIT 1;
    """
    def run(_conn, cur):
        cur.execute(q, (settings.SIMPLIFY_CANTON_M, settings.GJ_PRECISION, canton_id))
        row = cur.fetchone()
        if not row or not row.get("gj"):
            raise HTTPException(status_code=404, detail=f"Canton geometry not found for id={canton_id}")
        return {"id": row["id"], "code": row["canton_code"], "name": row["canton_name"], "geojson": json.loads(row["gj"])}
    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("cantons map_canton error canton_id=%s", canton_id)
        raise HTTPException(status_code=500, detail="Internal server error")

