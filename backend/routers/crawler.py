
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from database import with_conn
from dependencies import require_crawler_key
from services.geo_service import table_exists

router = APIRouter(prefix="/crawler", tags=["crawler"])
log = logging.getLogger("oikos")

_MAX_PAGE_SIZE = 5000
_DEFAULT_PAGE_SIZE = 1000


# ─── Addresses / buildings ────────────────────────────────────────────────────

@router.get("/addresses")
def crawler_addresses(
    page: int = Query(1, ge=1, description="1-indexed page number"),
    page_size: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    canton_code: Optional[str] = Query(None, description="Filter by 2-letter canton code, e.g. ZH"),
    bfs_nummer: Optional[int] = Query(None, ge=1, description="Filter by BFS gemeinde number"),
    _: None = Depends(require_crawler_key),
):
    """
    Paginated list of all buildings/addresses.
    Join key to roofs: bdg_egid == oikos.roofs.gwr_egid (cast to bigint).
    Coordinates are in WGS-84 (lat/lon) converted from LV95.
    """
    offset = (page - 1) * page_size

    # Build WHERE clause dynamically
    conditions = ["a.bdg_egid IS NOT NULL"]
    params: list = []

    if canton_code:
        conditions.append("a.com_canton = %s")
        params.append(canton_code.upper())

    if bfs_nummer:
        # Resolve gemeinde name + canton_code from bfs_nummer to match address columns
        conditions.append(
            "EXISTS ("
            "  SELECT 1 FROM oikos.gemeinden g"
            "  JOIN oikos.cantons c ON c.id = g.canton_id"
            "  WHERE g.bfs_nummer = %s"
            "    AND a.com_name = g.name"
            "    AND a.com_canton = c.canton_code"
            ")"
        )
        params.append(bfs_nummer)

    where = " AND ".join(conditions)

    q_data = f"""
    SELECT
        a.bdg_egid,
        a.stn_label,
        a.adr_number,
        a.zip_label,
        a.com_name,
        a.com_canton,
        a.adr_easting,
        a.adr_northing,
        ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(a.adr_easting, a.adr_northing), 2056), 4326)) AS lat,
        ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(a.adr_easting, a.adr_northing), 2056), 4326)) AS lon
    FROM oikos.addresses a
    WHERE {where}
    ORDER BY a.bdg_egid
    LIMIT %s OFFSET %s;
    """

    q_count = f"""
    SELECT COUNT(*) AS total FROM oikos.addresses a WHERE {where};
    """

    def run(_conn, cur):
        cur.execute(q_count, params)
        total = cur.fetchone()["total"]
        cur.execute(q_data, params + [page_size, offset])
        rows = cur.fetchall()
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": offset + len(rows) < total,
            "filters": {"canton_code": canton_code, "bfs_nummer": bfs_nummer},
            "addresses": rows,
        }

    try:
        return with_conn(run)
    except Exception:
        log.exception("crawler addresses error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ─── Roofs (aggregated by building) ──────────────────────────────────────────

@router.get("/roofs")
def crawler_roofs(
    page: int = Query(1, ge=1),
    page_size: int = Query(_DEFAULT_PAGE_SIZE, ge=1, le=_MAX_PAGE_SIZE),
    bfs_nummer: Optional[int] = Query(None, ge=1, description="Filter to buildings in this Gemeinde"),
    _: None = Depends(require_crawler_key),
):
    """
    Paginated roof aggregates, one row per building (bdg_egid).
    Uses oikos.roof_agg_by_egid when available (fast); falls back to live aggregation (slow).
    bdg_egid matches oikos.addresses.bdg_egid.
    """
    offset = (page - 1) * page_size

    def run(_conn, cur):
        has_agg = table_exists(cur, "oikos", "roof_agg_by_egid")

        if bfs_nummer:
            # Resolve gemeinde name + canton_code
            cur.execute(
                """
                SELECT g.name AS gemeinde_name, c.canton_code
                FROM oikos.gemeinden g
                JOIN oikos.cantons c ON c.id = g.canton_id
                WHERE g.bfs_nummer = %s LIMIT 1;
                """,
                (bfs_nummer,),
            )
            gem = cur.fetchone()
            if not gem:
                raise HTTPException(status_code=404, detail=f"Gemeinde not found for bfs_nummer={bfs_nummer}")
            gemeinde_name = gem["gemeinde_name"]
            canton_code = gem["canton_code"]

            if has_agg:
                q_count = """
                SELECT COUNT(DISTINCT r.gwr_egid) AS total
                FROM oikos.roof_agg_by_egid r
                WHERE EXISTS (
                    SELECT 1 FROM oikos.addresses a
                    WHERE a.bdg_egid = r.gwr_egid::bigint
                      AND a.com_name = %s AND a.com_canton = %s
                );
                """
                q_data = """
                SELECT r.gwr_egid::bigint AS bdg_egid,
                       r.roof_area_sum_m2, r.roof_area_union_m2,
                       r.sommer_total, r.winter_total, r.roof_parts_count
                FROM oikos.roof_agg_by_egid r
                WHERE EXISTS (
                    SELECT 1 FROM oikos.addresses a
                    WHERE a.bdg_egid = r.gwr_egid::bigint
                      AND a.com_name = %s AND a.com_canton = %s
                )
                ORDER BY r.gwr_egid::bigint
                LIMIT %s OFFSET %s;
                """
                cur.execute(q_count, (gemeinde_name, canton_code))
                total = cur.fetchone()["total"]
                cur.execute(q_data, (gemeinde_name, canton_code, page_size, offset))
            else:
                q_count = """
                SELECT COUNT(DISTINCT r.gwr_egid) AS total
                FROM oikos.roofs r
                WHERE r.gwr_egid IS NOT NULL AND r.geom IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM oikos.addresses a
                      WHERE a.bdg_egid = r.gwr_egid::bigint
                        AND a.com_name = %s AND a.com_canton = %s
                  );
                """
                q_data = """
                SELECT r.gwr_egid::bigint AS bdg_egid,
                       SUM(ST_Area(r.geom)) AS roof_area_sum_m2,
                       NULL::double precision AS roof_area_union_m2,
                       SUM(COALESCE(r.stromertrag_sommerhalbjahr, 0)) AS sommer_total,
                       SUM(COALESCE(r.stromertrag_winterhalbjahr, 0)) AS winter_total,
                       COUNT(*) AS roof_parts_count
                FROM oikos.roofs r
                WHERE r.gwr_egid IS NOT NULL AND r.geom IS NOT NULL
                  AND EXISTS (
                      SELECT 1 FROM oikos.addresses a
                      WHERE a.bdg_egid = r.gwr_egid::bigint
                        AND a.com_name = %s AND a.com_canton = %s
                  )
                GROUP BY r.gwr_egid
                ORDER BY r.gwr_egid::bigint
                LIMIT %s OFFSET %s;
                """
                cur.execute(q_count, (gemeinde_name, canton_code))
                total = cur.fetchone()["total"]
                cur.execute(q_data, (gemeinde_name, canton_code, page_size, offset))
        else:
            # All roofs, no gemeinde filter
            if has_agg:
                cur.execute("SELECT COUNT(*) AS total FROM oikos.roof_agg_by_egid;")
                total = cur.fetchone()["total"]
                cur.execute(
                    """
                    SELECT gwr_egid::bigint AS bdg_egid,
                           roof_area_sum_m2, roof_area_union_m2,
                           sommer_total, winter_total, roof_parts_count
                    FROM oikos.roof_agg_by_egid
                    ORDER BY gwr_egid::bigint
                    LIMIT %s OFFSET %s;
                    """,
                    (page_size, offset),
                )
            else:
                cur.execute(
                    "SELECT COUNT(DISTINCT gwr_egid) AS total FROM oikos.roofs WHERE gwr_egid IS NOT NULL AND geom IS NOT NULL;"
                )
                total = cur.fetchone()["total"]
                cur.execute(
                    """
                    SELECT gwr_egid::bigint AS bdg_egid,
                           SUM(ST_Area(geom)) AS roof_area_sum_m2,
                           NULL::double precision AS roof_area_union_m2,
                           SUM(COALESCE(stromertrag_sommerhalbjahr, 0)) AS sommer_total,
                           SUM(COALESCE(stromertrag_winterhalbjahr, 0)) AS winter_total,
                           COUNT(*) AS roof_parts_count
                    FROM oikos.roofs
                    WHERE gwr_egid IS NOT NULL AND geom IS NOT NULL
                    GROUP BY gwr_egid
                    ORDER BY gwr_egid::bigint
                    LIMIT %s OFFSET %s;
                    """,
                    (page_size, offset),
                )

        rows = cur.fetchall()
        source = "roof_agg_by_egid" if has_agg else "live_aggregation"
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": offset + len(rows) < total,
            "source": source,
            "filters": {"bfs_nummer": bfs_nummer},
            "roofs": rows,
        }

    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("crawler roofs error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ─── Buildings (joined addresses + roofs) ────────────────────────────────────

@router.get("/buildings")
def crawler_buildings(
    page: int = Query(1, ge=1),
    page_size: int = Query(500, ge=1, le=2000),
    canton_code: Optional[str] = Query(None, description="Filter by 2-letter canton code"),
    bfs_nummer: Optional[int] = Query(None, ge=1, description="Filter by BFS gemeinde number"),
    _: None = Depends(require_crawler_key),
):
    """
    Paginated buildings with joined roof aggregate data.
    Only buildings that have BOTH an address AND roof data are returned.
    Uses oikos.roof_agg_by_egid when available; returns 503 if live aggregation
    would be too expensive (i.e. the agg table is absent and no bfs_nummer filter is given).
    """
    offset = (page - 1) * page_size

    def run(_conn, cur):
        has_agg = table_exists(cur, "oikos", "roof_agg_by_egid")

        if not has_agg and not bfs_nummer:
            raise HTTPException(
                status_code=503,
                detail=(
                    "roof_agg_by_egid table not present. "
                    "Provide bfs_nummer to limit scope, or build the aggregation table first."
                ),
            )

        # Build address-side WHERE
        addr_conditions = ["a.bdg_egid IS NOT NULL"]
        addr_params: list = []

        if canton_code:
            addr_conditions.append("a.com_canton = %s")
            addr_params.append(canton_code.upper())

        gemeinde_name = None
        gem_canton_code = None
        if bfs_nummer:
            cur.execute(
                """
                SELECT g.name AS gemeinde_name, c.canton_code
                FROM oikos.gemeinden g
                JOIN oikos.cantons c ON c.id = g.canton_id
                WHERE g.bfs_nummer = %s LIMIT 1;
                """,
                (bfs_nummer,),
            )
            gem = cur.fetchone()
            if not gem:
                raise HTTPException(status_code=404, detail=f"Gemeinde not found for bfs_nummer={bfs_nummer}")
            gemeinde_name = gem["gemeinde_name"]
            gem_canton_code = gem["canton_code"]
            addr_conditions.append("a.com_name = %s AND a.com_canton = %s")
            addr_params.extend([gemeinde_name, gem_canton_code])

        addr_where = " AND ".join(addr_conditions)

        if has_agg:
            q_count = f"""
            SELECT COUNT(DISTINCT a.bdg_egid) AS total
            FROM oikos.addresses a
            JOIN oikos.roof_agg_by_egid r ON r.gwr_egid::bigint = a.bdg_egid
            WHERE {addr_where};
            """
            q_data = f"""
            SELECT
                a.bdg_egid,
                MIN(a.stn_label)    AS stn_label,
                MIN(a.adr_number)   AS adr_number,
                MIN(a.zip_label)    AS zip_label,
                MIN(a.com_name)     AS com_name,
                MIN(a.com_canton)   AS com_canton,
                MIN(a.adr_easting)  AS adr_easting,
                MIN(a.adr_northing) AS adr_northing,
                MIN(a.bdg_category) AS gwr_bdg_category,
                MIN(a.bdg_name)     AS gwr_bdg_name,
                ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)), 2056), 4326)) AS lat,
                ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)), 2056), 4326)) AS lon,
                r.roof_area_sum_m2,
                r.roof_area_union_m2,
                r.sommer_total,
                r.winter_total,
                r.roof_parts_count
            FROM oikos.addresses a
            JOIN oikos.roof_agg_by_egid r ON r.gwr_egid::bigint = a.bdg_egid
            WHERE {addr_where}
            GROUP BY a.bdg_egid, r.roof_area_sum_m2, r.roof_area_union_m2,
                     r.sommer_total, r.winter_total, r.roof_parts_count
            ORDER BY a.bdg_egid
            LIMIT %s OFFSET %s;
            """
            cur.execute(q_count, addr_params)
            total = cur.fetchone()["total"]
            cur.execute(q_data, addr_params + [page_size, offset])
        else:
            # Live aggregation — only reached when bfs_nummer is set (checked above)
            q_count = f"""
            SELECT COUNT(DISTINCT a.bdg_egid) AS total
            FROM oikos.addresses a
            JOIN (
                SELECT gwr_egid::bigint AS bdg_egid
                FROM oikos.roofs
                WHERE gwr_egid IS NOT NULL AND geom IS NOT NULL
                GROUP BY gwr_egid
            ) r ON r.bdg_egid = a.bdg_egid
            WHERE {addr_where};
            """
            q_data = f"""
            SELECT
                a.bdg_egid,
                MIN(a.stn_label)    AS stn_label,
                MIN(a.adr_number)   AS adr_number,
                MIN(a.zip_label)    AS zip_label,
                MIN(a.com_name)     AS com_name,
                MIN(a.com_canton)   AS com_canton,
                MIN(a.adr_easting)  AS adr_easting,
                MIN(a.adr_northing) AS adr_northing,
                MIN(a.bdg_category) AS gwr_bdg_category,
                MIN(a.bdg_name)     AS gwr_bdg_name,
                ST_Y(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)), 2056), 4326)) AS lat,
                ST_X(ST_Transform(ST_SetSRID(ST_MakePoint(MIN(a.adr_easting), MIN(a.adr_northing)), 2056), 4326)) AS lon,
                SUM(ST_Area(ro.geom))                              AS roof_area_sum_m2,
                NULL::double precision                             AS roof_area_union_m2,
                SUM(COALESCE(ro.stromertrag_sommerhalbjahr, 0))    AS sommer_total,
                SUM(COALESCE(ro.stromertrag_winterhalbjahr, 0))    AS winter_total,
                COUNT(ro.objectid)                                 AS roof_parts_count
            FROM oikos.addresses a
            JOIN oikos.roofs ro ON ro.gwr_egid::bigint = a.bdg_egid
            WHERE {addr_where} AND ro.geom IS NOT NULL AND ro.gwr_egid IS NOT NULL
            GROUP BY a.bdg_egid
            ORDER BY a.bdg_egid
            LIMIT %s OFFSET %s;
            """
            cur.execute(q_count, addr_params)
            total = cur.fetchone()["total"]
            cur.execute(q_data, addr_params + [page_size, offset])

        rows = cur.fetchall()
        source = "roof_agg_by_egid" if has_agg else "live_aggregation"
        return {
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": offset + len(rows) < total,
            "source": source,
            "filters": {"canton_code": canton_code, "bfs_nummer": bfs_nummer},
            "buildings": rows,
        }

    try:
        return with_conn(run)
    except HTTPException:
        raise
    except Exception:
        log.exception("crawler buildings error")
        raise HTTPException(status_code=500, detail="Internal server error")


# ─── Classifications (read + write) ──────────────────────────────────────────

@router.get("/classifications")
def crawler_get_classifications(
    status: Optional[str] = Query(None, description="Filter by crawl_status, e.g. 'done'"),
    canton_code: Optional[str] = Query(None, description="Filter by 2-letter canton code"),
    _: None = Depends(require_crawler_key),
):
    """
    Return the set of bdg_egids that have already been classified.
    Used by the crawler on startup to skip already-processed buildings.
    Response: {"egids": [<int>, ...]}
    """
    conditions = []
    params: list = []

    if status:
        conditions.append("crawl_status = %s")
        params.append(status)

    if canton_code:
        conditions.append("com_canton = %s")
        params.append(canton_code.upper())

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    def run(_conn, cur):
        cur.execute(
            f"SELECT bdg_egid FROM crawler.building_classifications {where};",
            params,
        )
        rows = cur.fetchall()
        return {"egids": [r["bdg_egid"] for r in rows]}

    try:
        return with_conn(run)
    except Exception:
        log.exception("crawler classifications GET error")
        raise HTTPException(status_code=500, detail="Internal server error")


class _ClassificationBatch(BaseModel):
    classifications: List[Dict[str, Any]]


@router.post("/classifications")
def crawler_post_classifications(
    body: _ClassificationBatch,
    _: None = Depends(require_crawler_key),
):
    """
    Upsert a batch of classification results into crawler.building_classifications.
    Response: {"upserted": N, "errors": [...]}
    """
    upserted = 0
    errors: list = []

    def run(_conn, cur):
        nonlocal upserted
        for c in body.classifications:
            egid = c.get("bdg_egid")
            if egid is None:
                errors.append({"error": "missing bdg_egid", "record": c})
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO crawler.building_classifications (
                        bdg_egid, stn_label, adr_number, zip_label, com_name, com_canton,
                        adr_easting, adr_northing, gwr_bdg_category, gwr_bdg_name,
                        main_category, sub_category, is_commercial, is_public, is_mixed_use,
                        confidence_score, classification_source, source_details,
                        matched_keywords, crawl_status, error_message,
                        crawled_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s,
                        now(), now()
                    )
                    ON CONFLICT (bdg_egid) DO UPDATE SET
                        stn_label             = EXCLUDED.stn_label,
                        adr_number            = EXCLUDED.adr_number,
                        zip_label             = EXCLUDED.zip_label,
                        com_name              = EXCLUDED.com_name,
                        com_canton            = EXCLUDED.com_canton,
                        adr_easting           = EXCLUDED.adr_easting,
                        adr_northing          = EXCLUDED.adr_northing,
                        gwr_bdg_category      = EXCLUDED.gwr_bdg_category,
                        gwr_bdg_name          = EXCLUDED.gwr_bdg_name,
                        main_category         = EXCLUDED.main_category,
                        sub_category          = EXCLUDED.sub_category,
                        is_commercial         = EXCLUDED.is_commercial,
                        is_public             = EXCLUDED.is_public,
                        is_mixed_use          = EXCLUDED.is_mixed_use,
                        confidence_score      = EXCLUDED.confidence_score,
                        classification_source = EXCLUDED.classification_source,
                        source_details        = EXCLUDED.source_details,
                        matched_keywords      = EXCLUDED.matched_keywords,
                        crawl_status          = EXCLUDED.crawl_status,
                        error_message         = EXCLUDED.error_message,
                        updated_at            = now();
                    """,
                    (
                        egid,
                        c.get("stn_label"),
                        c.get("adr_number"),
                        c.get("zip_label"),
                        c.get("com_name"),
                        c.get("com_canton"),
                        c.get("adr_easting"),
                        c.get("adr_northing"),
                        c.get("gwr_bdg_category"),
                        c.get("gwr_bdg_name"),
                        c.get("main_category"),
                        c.get("sub_category"),
                        c.get("is_commercial", False),
                        c.get("is_public", False),
                        c.get("is_mixed_use", False),
                        c.get("confidence_score"),
                        c.get("classification_source"),
                        json.dumps(c.get("source_details") or {}),
                        json.dumps(c.get("matched_keywords") or []),
                        c.get("crawl_status", "done"),
                        c.get("error_message"),
                    ),
                )
                upserted += 1
            except Exception as exc:
                log.exception("Failed to upsert bdg_egid=%s", egid)
                errors.append({"bdg_egid": egid, "error": str(exc)})

        return {"upserted": upserted, "errors": errors}

    try:
        return with_conn(run)
    except Exception:
        log.exception("crawler classifications POST error")
        raise HTTPException(status_code=500, detail="Internal server error")
