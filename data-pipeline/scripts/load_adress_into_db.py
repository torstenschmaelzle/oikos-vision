#!/usr/bin/env python3
import os
import sys
import csv
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, text

# -------------------------
# Config (env first, then defaults)
# -------------------------
CACHE_DIR = Path(os.environ.get("CACHE_DIR", "/home/ec2-user/data/cache"))
ADDR_CSV = Path(os.environ.get("ADDR_CSV", str(CACHE_DIR / "addresses_clean.csv")))

PGHOST = os.environ.get("PGHOST", "")
PGPORT = os.environ.get("PGPORT", "5432")
PGDATABASE = os.environ.get("PGDATABASE", "postgres")
PGUSER = os.environ.get("PGUSER", "postgres")
PGPASSWORD = os.environ.get("PGPASSWORD", "")
SSL_MODE = os.environ.get("PGSSLMODE", "require")

SCHEMA = os.environ.get("SCHEMA", "oikos")
TABLE = os.environ.get("ADDR_TABLE", "addresses")

# Expected columns in the CSV (after BOM removal + normalization)
EXPECTED_COLS = [
    "ADR_EGAID",
    "STR_ESID",
    "BDG_EGID",
    "ADR_EDID",
    "STN_LABEL",
    "ADR_NUMBER",
    "BDG_CATEGORY",
    "BDG_NAME",
    "ZIP_LABEL",
    "COM_FOSNR",
    "COM_NAME",
    "COM_CANTON",
    "ADR_STATUS",
    "ADR_OFFICIAL",
    "ADR_MODIFIED",
    "ADR_EASTING",
    "ADR_NORTHING",
]

# Our table columns (your DB uses lowercase snake_case)
DB_COLS = [
    "adr_egaid",
    "str_esid",
    "bdg_egid",
    "adr_edid",
    "stn_label",
    "adr_number",
    "bdg_category",
    "bdg_name",
    "zip_label",
    "com_fosnr",
    "com_name",
    "com_canton",
    "adr_status",
    "adr_official",
    "adr_modified",
    "adr_easting",
    "adr_northing",
]


def require_file(path: Path) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")
    if path.stat().st_size == 0:
        raise RuntimeError(f"File is empty: {path}")


def sqlalchemy_url() -> str:
    # SQLAlchemy psycopg2 URL
    # Note: password may contain special chars; easiest is to use env var and not print it.
    # If you have special chars and issues, use URL encoding or .pgpass.
    return f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}?sslmode={SSL_MODE}"


def ensure_schema_and_table(engine) -> None:
    # Create schema + table if needed
    ddl = f"""
    CREATE SCHEMA IF NOT EXISTS {SCHEMA};

    CREATE TABLE IF NOT EXISTS {SCHEMA}.{TABLE} (
      adr_egaid    bigint,
      str_esid     bigint,
      bdg_egid     bigint,
      adr_edid     integer,
      stn_label    text,
      adr_number   text,
      bdg_category text,
      bdg_name     text,
      zip_label    text,
      com_fosnr    integer,
      com_name     text,
      com_canton   text,
      adr_status   text,
      adr_official text,
      adr_modified text,
      adr_easting  double precision,
      adr_northing double precision
    );

    CREATE INDEX IF NOT EXISTS addresses_bdg_egid_idx ON {SCHEMA}.{TABLE} (bdg_egid);
    CREATE INDEX IF NOT EXISTS addresses_com_canton_idx ON {SCHEMA}.{TABLE} (com_canton);
    CREATE INDEX IF NOT EXISTS addresses_com_fosnr_idx ON {SCHEMA}.{TABLE} (com_fosnr);
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def detect_header(csv_path: Path):
    # Read the first line and normalize BOM
    with csv_path.open("rb") as f:
        first = f.readline()
    try:
        line = first.decode("utf-8-sig").strip("\n\r")
    except UnicodeDecodeError:
        line = first.decode("latin-1").strip("\n\r")

    # Split CSV header (assumes comma separated)
    # If your file is actually ; separated, we will catch it below.
    cols = [c.strip() for c in line.split(",")]
    return cols, line


def make_clean_csv(src: Path) -> Path:
    """
    Writes a temp CSV with:
    - BOM removed
    - header normalized exactly to EXPECTED_COLS
    - delimiter preserved as comma
    This avoids COPY failing due to BOM or weird header spelling.
    """
    tmp = src.with_suffix(".clean.csv")

    with src.open("r", encoding="utf-8-sig", newline="") as fin, tmp.open("w", encoding="utf-8", newline="") as fout:
        reader = csv.DictReader(fin)
        # Normalize fieldnames
        in_fields = [fn.strip() for fn in (reader.fieldnames or [])]

        # If delimiter was wrong, DictReader will produce a single huge column.
        # Detect and hard fail with a helpful message.
        if len(in_fields) == 1 and "," not in in_fields[0] and ";" in in_fields[0]:
            raise RuntimeError(
                "It looks like the file might be ';' separated. "
                "If so, re-run with a proper delimiter conversion or adjust the script."
            )

        # Remove BOM already handled by utf-8-sig, but keep safety
        in_fields = [fn.replace("\ufeff", "") for fn in in_fields]

        missing = [c for c in EXPECTED_COLS if c not in in_fields]
        if missing:
            raise RuntimeError(f"CSV header missing columns: {missing}\nFound: {in_fields}")

        writer = csv.DictWriter(fout, fieldnames=EXPECTED_COLS)
        writer.writeheader()

        for row in reader:
            out = {k: row.get(k, "") for k in EXPECTED_COLS}
            writer.writerow(out)

    return tmp


def copy_into_db(clean_csv: str) -> None:
    clean_csv = str(clean_csv)
    import os, shlex, subprocess

    pgpassword = os.environ.get("PGPASSWORD")
    if not pgpassword:
        raise RuntimeError("PGPASSWORD is not set. Export it first, e.g.: export PGPASSWORD='...'" )

    host = os.environ.get("PGHOST", "")
    port = os.environ.get("PGPORT", "5432")
    dbname = os.environ.get("PGDATABASE", "postgres")
    user = os.environ.get("PGUSER", "postgres")

    cols = (
        "adr_egaid,str_esid,bdg_egid,adr_edid,stn_label,adr_number,bdg_category,bdg_name,"
        "zip_label,com_fosnr,com_name,com_canton,adr_status,adr_official,adr_modified,adr_easting,adr_northing"
    )

    # IMPORTANT: \copy must be executed by psql, not by the server
    copy_cmd = (
        f"\\copy oikos.addresses ({cols}) "
        f"FROM {shlex.quote(clean_csv)} "
        f"WITH (FORMAT csv, HEADER true, DELIMITER ',', QUOTE '\"', ESCAPE '\"')"
    )

    cmd = [
        "psql",
        "-h", host,
        "-p", port,
        "-U", user,
        "-d", dbname,
        "--set", "ON_ERROR_STOP=1",
        "-c", copy_cmd,
    ]

    env = os.environ.copy()
    # keep PGPASSWORD in env for non-interactive auth
    env["PGPASSWORD"] = pgpassword

    print("Running:", " ".join(shlex.quote(x) for x in cmd))
    rc = subprocess.call(cmd, env=env)
    if rc != 0:
        raise RuntimeError(f"psql COPY failed with exit code {rc}")


def main():
    require_file(ADDR_CSV)
    if not PGPASSWORD:
        print("ERROR: PGPASSWORD is not set. Export it first, e.g.:")
        print("  export PGPASSWORD=<your-password>")
        sys.exit(2)

    # Basic header check
    cols, raw = detect_header(ADDR_CSV)
    print(f"ADDR_CSV={ADDR_CSV}")
    print(f"Detected header columns: {len(cols)}")

    engine = create_engine(sqlalchemy_url(), pool_pre_ping=True)
    ensure_schema_and_table(engine)

    # Create clean CSV (removes BOM and normalizes header)
    clean_csv = make_clean_csv(ADDR_CSV)
    print(f"Clean CSV written: {clean_csv}")

    # Load into DB via COPY
    copy_into_db(clean_csv)

    print("Done.")


if __name__ == "__main__":
    main()