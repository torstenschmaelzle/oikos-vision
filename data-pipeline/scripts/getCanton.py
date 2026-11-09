import os
import math
import sys
import time
from typing import Iterable, List, Optional

import pandas as pd
import geopandas as gpd
from shapely import wkb
from sqlalchemy import create_engine, text

# -----------------------------
# Config (edit if needed)
# -----------------------------
CACHE_DIR = os.environ.get("CACHE_DIR", "/home/ec2-user/data/cache")

SOLKAT_GPKG = os.environ.get("SOLKAT_GPKG", f"{CACHE_DIR}/SOLKAT_DACH.gpkg")
SOLKAT_LAYER = os.environ.get("SOLKAT_LAYER", "SOLKAT_CH_DACH")

ADDR_CSV = os.environ.get("ADDR_CSV", f"{CACHE_DIR}/addresses.csv")

GDB_DIR = os.environ.get("GDB_DIR", f"{CACHE_DIR}/swissBOUNDARIES3D.gdb")
CANTON_LAYER = os.environ.get("CANTON_LAYER", "TLM_KANTONSGEBIET")

# RDS connection (must be set in env)
PGHOST = os.environ.get("PGHOST")
PGPORT = int(os.environ.get("PGPORT", "5432"))
PGUSER = os.environ.get("PGUSER")
PGDATABASE = os.environ.get("PGDATABASE", "postgres")
PGPASSWORD = os.environ.get("PGPASSWORD")  # export this before running
PGSSLMODE = os.environ.get("PGSSLMODE", "require")

# Chunk sizes
ROOF_CHUNK_ROWS = int(os.environ.get("ROOF_CHUNK_ROWS", "200000"))   # tune: 50k..500k
ADDR_CHUNK_ROWS = int(os.environ.get("ADDR_CHUNK_ROWS", "200000"))   # tune

# If you want to test quickly:
MAX_ROOF_ROWS = os.environ.get("MAX_ROOF_ROWS")  # e.g. 500000 for test, else None
MAX_ADDR_ROWS = os.environ.get("MAX_ADDR_ROWS")  # e.g. 500000 for test, else None


def log(msg: str) -> None:
    print(msg, flush=True)


def require_env() -> None:
    missing = [k for k in ["PGHOST", "PGUSER", "PGPASSWORD"] if not os.environ.get(k)]
    if missing:
        raise SystemExit(f"Missing env vars: {missing}. Export PGHOST, PGUSER, PGPASSWORD (and optionally PGDATABASE).")


def make_engine():
    url = f"postgresql+psycopg2://{PGUSER}:{PGPASSWORD}@{PGHOST}:{PGPORT}/{PGDATABASE}?sslmode={PGSSLMODE}"
    return create_engine(url, future=True)


def file_checks():
    for p in [SOLKAT_GPKG, ADDR_CSV]:
        if not os.path.isfile(p):
            raise SystemExit(f"Missing file: {p}")
    if not os.path.isdir(GDB_DIR):
        raise SystemExit(f"Missing directory: {GDB_DIR}")


def pick_canton_name_col(gdf: gpd.GeoDataFrame) -> str:
    cols = [c for c in gdf.columns if c.lower() not in ["geometry", "geom"]]
    lower = {c.lower(): c for c in cols}
    for cand in ["name", "name_de", "kantonsname", "kt_name", "kanton"]:
        if cand in lower:
            return lower[cand]
    for c in cols:
        if "name" in c.lower():
            return c
    raise RuntimeError(f"Could not detect canton name column. Columns: {cols}")


def normalize_int_series(s: pd.Series) -> pd.Series:
    s2 = pd.to_numeric(s, errors="coerce")
    s2 = s2.round(0)
    return s2.astype("Int64")


def reset_tables(engine):
    log("Ensuring PostGIS + schema + tables exist (should already be done by your shell script)...")
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS oikos;"))

        # Truncate instead of drop (keeps schema)
        conn.execute(text("TRUNCATE oikos.cantons RESTART IDENTITY CASCADE;"))
        conn.execute(text("TRUNCATE oikos.roofs CASCADE;"))
        conn.execute(text("TRUNCATE oikos.addresses CASCADE;"))
        conn.execute(text("TRUNCATE oikos.roof_canton CASCADE;"))


def load_cantons(engine):
    log(f"Loading cantons from GDB layer {CANTON_LAYER} ...")
    cant = gpd.read_file(GDB_DIR, layer=CANTON_LAYER)

    if cant.empty:
        raise RuntimeError("Canton layer is empty")

    name_col = pick_canton_name_col(cant)
    cant = cant[[name_col, "geometry"]].rename(columns={name_col: "canton_name"})
    cant["canton_name"] = cant["canton_name"].astype(str).str.strip()

    # Important: enforce EPSG:2056
    if cant.crs is None:
        log("Cantons CRS is None. Assuming EPSG:2056.")
        cant = cant.set_crs(2056)
    elif str(cant.crs).endswith("2056") is False:
        log(f"Reprojecting cantons {cant.crs} -> EPSG:2056")
        cant = cant.to_crs(2056)

    # Insert using WKB, keep geometry type MULTIPOLYGON
    df = pd.DataFrame({
        "canton_name": cant["canton_name"],
        "geom_wkb": cant.geometry.to_wkb(),
    })

    with engine.begin() as conn:
        conn.execute(text("TRUNCATE oikos.cantons RESTART IDENTITY CASCADE;"))
        conn.execute(text("""
            INSERT INTO oikos.cantons (canton_name, geom)
            SELECT canton_name, ST_SetSRID(ST_GeomFromWKB(decode(encode(geom_wkb, 'hex'),'hex')), 2056)
            FROM (SELECT :canton_name AS canton_name, :geom_wkb AS geom_wkb) AS v
        """), [])  # no-op, we will bulk insert below

    # bulk insert
    with engine.begin() as conn:
        rows = [{"canton_name": r.canton_name, "geom_wkb": bytes(r.geom_wkb)} for r in df.itertuples(index=False)]
        conn.execute(
            text("""
            INSERT INTO oikos.cantons (canton_name, geom)
            VALUES (:canton_name, ST_SetSRID(ST_GeomFromWKB(:geom_wkb), 2056))
            """),
            rows
        )
        conn.execute(text("ANALYZE oikos.cantons;"))

    log(f"Inserted cantons: {len(df)}")


def iter_roof_chunks() -> Iterable[gpd.GeoDataFrame]:
    # geopandas 1.0 can read with rows= but no iterator; we do manual paging with SQL inside gpkg via pyogrio if available
    # easiest reliable approach: read in slices using rows=(offset, count) not supported; so we load in row blocks using sqlite query
    # We'll use pyogrio.read_dataframe with skip_features + max_features if available
    try:
        import pyogrio
    except Exception as e:
        raise RuntimeError("pyogrio is required for chunked reading of huge gpkg") from e

    # Count total rows
    meta = pyogrio.list_layers(SOLKAT_GPKG)
    total = None
    for name, geom_type, crs, extent in meta:
        if name == SOLKAT_LAYER:
            # pyogrio doesn't return count here; we do sqlite query
            break

    import sqlite3
    con = sqlite3.connect(SOLKAT_GPKG)
    try:
        cur = con.execute(f"SELECT COUNT(*) FROM {SOLKAT_LAYER}")
        total = cur.fetchone()[0]
    finally:
        con.close()

    if MAX_ROOF_ROWS:
        total = min(total, int(MAX_ROOF_ROWS))

    log(f"Total roofs rows to process: {total}")

    offset = 0
    while offset < total:
        n = min(ROOF_CHUNK_ROWS, total - offset)
        gdf = pyogrio.read_dataframe(
            SOLKAT_GPKG,
            layer=SOLKAT_LAYER,
            skip_features=offset,
            max_features=n,
        )
        # enforce CRS
        if gdf.crs is None:
            gdf = gdf.set_crs(2056)
        yield gdf
        offset += n
        log(f"Roofs chunk done: offset={offset}/{total}")


def load_roofs(engine):
    log("Loading roofs into oikos.roofs in chunks ...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE oikos.roofs;"))

    total_inserted = 0
    t0 = time.time()

    for chunk in iter_roof_chunks():
        if chunk.empty:
            continue

        # Ensure expected columns exist
        need_cols = [
            "objectid","geom","DF_UID","DF_NUMMER","DATUM_ERSTELLUNG","DATUM_AENDERUNG",
            "SB_UUID","SB_OBJEKTART","SB_DATUM_ERSTELLUNG","SB_DATUM_AENDERUNG",
            "KLASSE","FLAECHE","AUSRICHTUNG","NEIGUNG","MSTRAHLUNG","GSTRAHLUNG",
            "STROMERTRAG","STROMERTRAG_SOMMERHALBJAHR","STROMERTRAG_WINTERHALBJAHR",
            "WAERMEERTRAG","DUSCHGAENGE","DG_HEIZUNG","DG_WAERMEBEDARF","BEDARF_WARMWASSER",
            "BEDARF_HEIZUNG","FLAECHE_KOLLEKTOREN","VOLUMEN_SPEICHER","GWR_EGID"
        ]
        # geopandas uses 'geom' column name from gpkg
        if "geom" in chunk.columns and "geometry" in chunk.columns:
            chunk = chunk.drop(columns=["geometry"])
            chunk = chunk.rename(columns={"geom": "geometry"})
        elif "geom" in chunk.columns:
            chunk = chunk.rename(columns={"geom": "geometry"})
        else:
            # maybe geometry already in geometry
            pass

        if "geometry" not in chunk.columns:
            raise RuntimeError("No geometry column in roof chunk")

        # Normalize EGID and keep full roof multipolygon
        chunk["GWR_EGID"] = normalize_int_series(chunk["GWR_EGID"])
        geom_wkb = chunk["geometry"].to_wkb()

        out = pd.DataFrame({
            "objectid": chunk["objectid"].astype("int64", errors="ignore"),
            "df_uid": chunk.get("DF_UID"),
            "df_nummer": chunk.get("DF_NUMMER"),
            "datum_erstellung": chunk.get("DATUM_ERSTELLUNG"),
            "datum_aenderung": chunk.get("DATUM_AENDERUNG"),
            "sb_uuid": chunk.get("SB_UUID"),
            "sb_objektart": chunk.get("SB_OBJEKTART"),
            "sb_datum_erstellung": chunk.get("SB_DATUM_ERSTELLUNG"),
            "sb_datum_aenderung": chunk.get("SB_DATUM_AENDERUNG"),
            "klasse": chunk.get("KLASSE"),
            "flaeche": chunk.get("FLAECHE"),
            "ausrichtung": chunk.get("AUSRICHTUNG"),
            "neigung": chunk.get("NEIGUNG"),
            "mstrahlung": chunk.get("MSTRAHLUNG"),
            "gstrahlung": chunk.get("GSTRAHLUNG"),
            "stromertrag": chunk.get("STROMERTRAG"),
            "stromertrag_sommerhalbjahr": chunk.get("STROMERTRAG_SOMMERHALBJAHR"),
            "stromertrag_winterhalbjahr": chunk.get("STROMERTRAG_WINTERHALBJAHR"),
            "waermeertrag": chunk.get("WAERMEERTRAG"),
            "duschgaenge": chunk.get("DUSCHGAENGE"),
            "dg_heizung": chunk.get("DG_HEIZUNG"),
            "dg_waermebedarf": chunk.get("DG_WAERMEBEDARF"),
            "bedarf_warmwasser": chunk.get("BEDARF_WARMWASSER"),
            "bedarf_heizung": chunk.get("BEDARF_HEIZUNG"),
            "flaeche_kollektoren": chunk.get("FLAECHE_KOLLEKTOREN"),
            "volumen_speicher": chunk.get("VOLUMEN_SPEICHER"),
            "gwr_egid": chunk.get("GWR_EGID"),
            "geom_wkb": [bytes(x) for x in geom_wkb],
        })

        rows = out.to_dict(orient="records")

        with engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO oikos.roofs (
                  objectid, df_uid, df_nummer, datum_erstellung, datum_aenderung,
                  sb_uuid, sb_objektart, sb_datum_erstellung, sb_datum_aenderung,
                  klasse, flaeche, ausrichtung, neigung, mstrahlung, gstrahlung,
                  stromertrag, stromertrag_sommerhalbjahr, stromertrag_winterhalbjahr,
                  waermeertrag, duschgaenge, dg_heizung, dg_waermebedarf,
                  bedarf_warmwasser, bedarf_heizung, flaeche_kollektoren,
                  volumen_speicher, gwr_egid, geom
                )
                VALUES (
                  :objectid, :df_uid, :df_nummer, :datum_erstellung, :datum_aenderung,
                  :sb_uuid, :sb_objektart, :sb_datum_erstellung, :sb_datum_aenderung,
                  :klasse, :flaeche, :ausrichtung, :neigung, :mstrahlung, :gstrahlung,
                  :stromertrag, :stromertrag_sommerhalbjahr, :stromertrag_winterhalbjahr,
                  :waermeertrag, :duschgaenge, :dg_heizung, :dg_waermebedarf,
                  :bedarf_warmwasser, :bedarf_heizung, :flaeche_kollektoren,
                  :volumen_speicher, :gwr_egid, ST_SetSRID(ST_GeomFromWKB(:geom_wkb), 2056)
                )
                """),
                rows
            )

        total_inserted += len(out)
        log(f"Inserted roofs so far: {total_inserted} rows")

    with engine.begin() as conn:
        conn.execute(text("ANALYZE oikos.roofs;"))

    log(f"Roofs load complete. Inserted={total_inserted} elapsed={(time.time()-t0):.1f}s")


def load_addresses(engine):
    log("Loading addresses into oikos.addresses in chunks ...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE oikos.addresses;"))

    total = 0
    for i, chunk in enumerate(pd.read_csv(ADDR_CSV, sep=";", dtype=str, chunksize=ADDR_CHUNK_ROWS, engine="python"), start=1):
        # handle BOM on first col
        chunk.columns = chunk.columns.astype(str).str.replace("\ufeff", "", regex=False).str.strip()

        if MAX_ADDR_ROWS:
            cap = int(MAX_ADDR_ROWS) - total
            if cap <= 0:
                break
            if len(chunk) > cap:
                chunk = chunk.iloc[:cap].copy()

        # Normalize types
        out = pd.DataFrame({
            "adr_egaid": pd.to_numeric(chunk.get("ADR_EGAID"), errors="coerce"),
            "str_esid": pd.to_numeric(chunk.get("STR_ESID"), errors="coerce"),
            "bdg_egid": pd.to_numeric(chunk.get("BDG_EGID"), errors="coerce"),
            "adr_edid": pd.to_numeric(chunk.get("ADR_EDID"), errors="coerce"),
            "stn_label": chunk.get("STN_LABEL"),
            "adr_number": chunk.get("ADR_NUMBER"),
            "bdg_category": chunk.get("BDG_CATEGORY"),
            "bdg_name": chunk.get("BDG_NAME"),
            "zip_label": chunk.get("ZIP_LABEL"),
            "com_fosnr": pd.to_numeric(chunk.get("COM_FOSNR"), errors="coerce"),
            "com_name": chunk.get("COM_NAME"),
            "com_canton": chunk.get("COM_CANTON"),
            "adr_status": chunk.get("ADR_STATUS"),
            "adr_official": chunk.get("ADR_OFFICIAL"),
            "adr_modified": chunk.get("ADR_MODIFIED"),
            "adr_easting": pd.to_numeric(chunk.get("ADR_EASTING"), errors="coerce"),
            "adr_northing": pd.to_numeric(chunk.get("ADR_NORTHING"), errors="coerce"),
        })

        rows = out.to_dict(orient="records")
        with engine.begin() as conn:
            conn.execute(
                text("""
                INSERT INTO oikos.addresses (
                  adr_egaid, str_esid, bdg_egid, adr_edid, stn_label, adr_number,
                  bdg_category, bdg_name, zip_label, com_fosnr, com_name, com_canton,
                  adr_status, adr_official, adr_modified, adr_easting, adr_northing
                )
                VALUES (
                  :adr_egaid, :str_esid, :bdg_egid, :adr_edid, :stn_label, :adr_number,
                  :bdg_category, :bdg_name, :zip_label, :com_fosnr, :com_name, :com_canton,
                  :adr_status, :adr_official, :adr_modified, :adr_easting, :adr_northing
                )
                """),
                rows
            )

        total += len(out)
        log(f"Addresses chunk {i} inserted. Total={total}")
        if MAX_ADDR_ROWS and total >= int(MAX_ADDR_ROWS):
            break

    with engine.begin() as conn:
        conn.execute(text("ANALYZE oikos.addresses;"))

    log(f"Addresses load complete. Inserted={total}")


def build_mappings(engine):
    log("Building roof_canton table (spatial join) ...")
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE oikos.roof_canton;"))
        conn.execute(text("""
            INSERT INTO oikos.roof_canton (roof_id, egid, canton_name, roof_point)
            SELECT
              r.objectid AS roof_id,
              r.gwr_egid AS egid,
              c.canton_name,
              ST_PointOnSurface(r.geom) AS roof_point
            FROM oikos.roofs r
            LEFT JOIN LATERAL (
              SELECT canton_name, geom
              FROM oikos.cantons c
              WHERE ST_Intersects(c.geom, ST_PointOnSurface(r.geom))
              LIMIT 1
            ) c ON true;
        """))
        conn.execute(text("ANALYZE oikos.roof_canton;"))
    log("roof_canton built.")

    log("Recreating roof_directory view ...")
    with engine.begin() as conn:
        conn.execute(text("DROP VIEW IF EXISTS oikos.roof_directory;"))
        conn.execute(text("""
            CREATE VIEW oikos.roof_directory AS
            SELECT
              r.objectid AS roof_id,
              r.gwr_egid AS egid,
              rc.canton_name,

              a.com_canton,
              a.com_fosnr,
              a.com_name,
              a.zip_label,
              a.stn_label,
              a.adr_number,
              a.adr_easting,
              a.adr_northing,

              r.klasse,
              r.flaeche,
              r.ausrichtung,
              r.neigung,
              r.mstrahlung,
              r.gstrahlung,
              r.stromertrag,
              r.stromertrag_sommerhalbjahr,
              r.stromertrag_winterhalbjahr,
              r.waermeertrag,
              r.duschgaenge,
              r.dg_heizung,
              r.dg_waermebedarf,
              r.bedarf_warmwasser,
              r.bedarf_heizung,
              r.flaeche_kollektoren,
              r.volumen_speicher,

              r.geom AS roof_geom
            FROM oikos.roofs r
            LEFT JOIN oikos.roof_canton rc
              ON rc.roof_id = r.objectid
            LEFT JOIN oikos.addresses a
              ON a.bdg_egid = r.gwr_egid;
        """))
    log("roof_directory view ready.")


def quick_checks(engine):
    log("Running quick checks ...")
    with engine.begin() as conn:
        n_c = conn.execute(text("SELECT COUNT(*) FROM oikos.cantons")).scalar()
        n_r = conn.execute(text("SELECT COUNT(*) FROM oikos.roofs")).scalar()
        n_a = conn.execute(text("SELECT COUNT(*) FROM oikos.addresses")).scalar()
        log(f"cantons={n_c} roofs={n_r} addresses={n_a}")

        miss_canton = conn.execute(text("""
            SELECT ROUND(AVG(CASE WHEN canton_name IS NULL THEN 1 ELSE 0 END)::numeric, 4)
            FROM oikos.roof_canton
        """)).scalar()
        log(f"roof_canton missing ratio={miss_canton}")

        sample = conn.execute(text("""
            SELECT roof_id, egid, canton_name, com_name, zip_label, stn_label, adr_number, stromertrag
            FROM oikos.roof_directory
            WHERE egid IS NOT NULL
            LIMIT 10
        """)).fetchall()
        for row in sample:
            log(str(row))


def main():
    require_env()
    file_checks()
    engine = make_engine()

    reset_tables(engine)
    load_cantons(engine)

    # big steps
    load_roofs(engine)
    load_addresses(engine)

    build_mappings(engine)
    quick_checks(engine)

    log("Done.")


if __name__ == "__main__":
    main()