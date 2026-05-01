
from typing import Dict, Any, List
from fastapi import HTTPException

def geojson_feature_collection(features: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}

def require_canton_id(cur, canton_id: int) -> Dict[str, Any]:
    cur.execute("SELECT id, canton_name, canton_code FROM oikos.cantons WHERE id = %s LIMIT 1;", (canton_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Canton not found for id={canton_id}")
    return row

def require_gemeinde(cur, bfs_nummer: int) -> Dict[str, Any]:
    cur.execute("""
        SELECT g.bfs_nummer, g.name, g.canton_id, c.canton_code, c.canton_name
        FROM oikos.gemeinden g JOIN oikos.cantons c ON c.id = g.canton_id
        WHERE g.bfs_nummer = %s LIMIT 1;
    """, (bfs_nummer,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Gemeinde not found for bfs_nummer={bfs_nummer}")
    return row

def table_exists(cur, schema: str, table: str) -> bool:
    cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s LIMIT 1;", (schema, table))
    return cur.fetchone() is not None

