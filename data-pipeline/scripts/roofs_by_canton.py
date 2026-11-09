#!/usr/bin/env python3
import os
import sys
import csv
import psycopg2


DEFAULT_CANTON = "SG"

def require_env(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"ERROR: {name} is not set.", file=sys.stderr)
        sys.exit(2)
    return val

def main():
    canton = (sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CANTON).strip().upper()

    host = require_env("PGHOST")
    port = os.environ.get("PGPORT", "5432")
    db   = os.environ.get("PGDATABASE", "postgres")
    user = os.environ.get("PGUSER", "postgres")
    pw   = require_env("PGPASSWORD")
    ssl  = os.environ.get("PGSSLMODE", "require")

    conn = psycopg2.connect(
        host=host, port=port, dbname=db, user=user, password=pw, sslmode=ssl
    )
    conn.autocommit = True

    sql = """
    WITH roofs_in_canton AS (
      SELECT
        r.gwr_egid::bigint AS bdg_egid,
        r.objectid AS roof_objectid,
        r.stromertrag_sommerhalbjahr,
        r.stromertrag_winterhalbjahr
      FROM oikos.roofs r
      JOIN oikos.addresses a
        ON a.bdg_egid = r.gwr_egid::bigint
      WHERE a.com_canton = %s
        AND r.gwr_egid IS NOT NULL
    ),
    agg AS (
      SELECT
        bdg_egid,
        MIN(roof_objectid) AS roof_objectid_sample,
        SUM(stromertrag_sommerhalbjahr)::bigint AS strom_sommer_total,
        SUM(stromertrag_winterhalbjahr)::bigint AS strom_winter_total,
        COUNT(*)::int AS rows_aggregated
      FROM roofs_in_canton
      GROUP BY bdg_egid
    )
    SELECT
      a.roof_objectid_sample AS roof_objectid,
      a.bdg_egid AS gwr_egid,
      a.strom_sommer_total,
      a.strom_winter_total,
      a.rows_aggregated,
      %s AS canton
    FROM agg a
    ORDER BY a.bdg_egid;
    """

    cur = conn.cursor(name="roofs_stream")  # server-side cursor (streams)
    cur.itersize = 50000
    cur.execute(sql, (canton, canton))

    w = csv.writer(sys.stdout)
    w.writerow([
        "roof_objectid",
        "gwr_egid",
        "strom_sommer_total",
        "strom_winter_total",
        "rows_aggregated",
        "canton"
    ])

    rows_written = 0
    for row in cur:
        w.writerow(row)
        rows_written += 1

    cur.close()
    conn.close()

    print(f"WROTE_ROWS={rows_written}", file=sys.stderr)

if __name__ == "__main__":
    main()