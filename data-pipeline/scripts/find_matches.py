import os
import sys
import tempfile
from pathlib import Path

import pandas as pd
import geopandas as gpd
import s3fs


# -------------------------
# Config
# -------------------------
BUCKET = "oikosdata"

# SOLKAT
SOLAR_GPKG_S3 = f"s3://{BUCKET}/unzipped/SOLKAT_DACH.gpkg"
SOLAR_LAYER = "SOLKAT_CH_DACH"

# Address CSV
ADDRESS_CSV_S3 = f"s3://{BUCKET}/unzipped/amtliches-gebaeudeadressverzeichnis_ch_2056.csv"
ADDRESS_SEP = ";"

# Swiss boundaries GDB prefix in S3
BOUNDARIES_PREFIX = f"{BUCKET}/unzipped/Swiss_Boundaries/"  # fs.ls uses bucket/key, not s3://

# Target layer names
CANTON_LAYER = "TLM_KANTONSGEBIET"
# Municipality layer not used here, only canton required for now

# Local cache on EC2
CACHE_DIR = Path("/home/ec2-user/data/cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

CACHED_GPKG = CACHE_DIR / "SOLKAT_DACH.gpkg"
CACHED_GDB = CACHE_DIR / "swissBOUNDARIES3D.gdb"

# Sampling controls
READ_ROOFS_ROWS = 50000     # read first N rows from gpkg to find enough EGIDs
TAKE_ROOFS = 100            # final number of roofs to output
RANDOM_SAMPLE = False       # set True if you want random selection among EGID roofs
RANDOM_STATE = 42

# Address chunking
ADDRESS_CHUNKSIZE = 300_000  # adjust if memory tight
MAX_ADDRESS_MATCH_ROWS = 5000  # safety cap


def log(msg: str):
    print(msg, flush=True)


def locate_gdb_in_s3(fs: s3fs.S3FileSystem) -> str:
    """
    Find first .gdb folder under boundaries prefix.
    Returns: s3://... path
    """
    log("Locating .gdb in S3 ...")
    # list top level keys
    items = fs.ls(BOUNDARIES_PREFIX)
    gdb_candidates = [p for p in items if p.lower().endswith(".gdb")]
    if not gdb_candidates:
        # sometimes .gdb is nested deeper. Do a broader search.
        deeper = fs.find(BOUNDARIES_PREFIX, maxdepth=5)
        gdb_candidates = [p for p in deeper if p.lower().endswith(".gdb")]
    if not gdb_candidates:
        raise RuntimeError("No .gdb folder found under Swiss_Boundaries prefix in S3.")
    # pick first
    gdb_key = gdb_candidates[0]
    return "s3://" + gdb_key  # add scheme


def download_gdb_folder(fs: s3fs.S3FileSystem, gdb_s3: str, local_gdb: Path):
    """
    Download a whole FileGDB directory from S3 to local.
    """
    if local_gdb.exists() and any(local_gdb.iterdir()):
        log(f"Using cached GDB: {local_gdb}")
        return

    log(f"Downloading GDB to: {local_gdb}")
    local_gdb.parent.mkdir(parents=True, exist_ok=True)

    # s3fs wants key style without s3:// for fs.get
    gdb_key = gdb_s3.replace("s3://", "")
    fs.get(gdb_key, str(local_gdb), recursive=True)


def download_file_if_missing(fs: s3fs.S3FileSystem, s3_path: str, local_path: Path):
    if local_path.exists() and local_path.stat().st_size > 0:
        log(f"Using cached {local_path.name}: {local_path}")
        return
    log(f"Downloading {s3_path} to: {local_path}")
    fs.get(s3_path, str(local_path))


def pick_canton_name_column(cantons: gpd.GeoDataFrame) -> str:
    """
    Try to auto-detect the canton name column.
    """
    cols = [c.lower() for c in cantons.columns]
    candidates = []
    for c in cantons.columns:
        cl = c.lower()
        if "name" in cl or "kanton" in cl or "bezeichnung" in cl:
            candidates.append(c)

    # common swissBOUNDARIES name fields sometimes include: NAME, NAME_DE, NAME_FR, NAME_IT
    for pref in ["name_de", "name", "kantonname", "bez", "bezeichnung"]:
        for c in cantons.columns:
            if c.lower() == pref:
                return c

    if candidates:
        return candidates[0]

    raise RuntimeError(f"Could not detect canton name column. Columns: {cantons.columns.tolist()}")


def ensure_lv95(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Ensure CRS is EPSG:2056 (LV95). If missing, assume 2056.
    """
    if gdf.crs is None:
        log("Warning: CRS missing. Assuming EPSG:2056.")
        gdf = gdf.set_crs(epsg=2056)
        return gdf
    # If it is not 2056, reproject
    try:
        if gdf.crs.to_epsg() != 2056:
            log(f"Reprojecting from {gdf.crs} to EPSG:2056")
            gdf = gdf.to_crs(epsg=2056)
    except Exception:
        # if to_epsg fails, still try reproject to 2056
        log(f"CRS check failed, reprojecting to EPSG:2056 anyway. CRS: {gdf.crs}")
        gdf = gdf.to_crs(epsg=2056)
    return gdf


def main():
    fs = s3fs.S3FileSystem(anon=False)

    # -------------------------
    # 1) Get boundaries GDB
    # -------------------------
    gdb_s3 = locate_gdb_in_s3(fs)
    log(f"Using GDB: {gdb_s3}")
    download_gdb_folder(fs, gdb_s3, CACHED_GDB)

    # Load canton layer
    log(f"Loading canton layer: {CANTON_LAYER}")
    cantons = gpd.read_file(str(CACHED_GDB), layer=CANTON_LAYER)
    cantons = ensure_lv95(cantons)

    # identify canton name column
    canton_name_col = pick_canton_name_column(cantons)
    log(f"Detected canton name column: {canton_name_col}")

    # keep only needed fields
    cantons = cantons[[canton_name_col, "geometry"]].rename(columns={canton_name_col: "canton_name"})
    cantons["canton_name"] = cantons["canton_name"].astype(str).str.strip()

    # basic canton sanity check
    log(f"Canton features: {len(cantons)}")
    log("Canton name sample:")
    log(str(cantons["canton_name"].head(5).tolist()))

    # -------------------------
    # 2) Get SOLKAT gpkg (local cache)
    # -------------------------
    download_file_if_missing(fs, SOLAR_GPKG_S3, CACHED_GPKG)

    # -------------------------
    # 3) Load roofs and compute centroids
    # -------------------------
    log(f"Loading roofs from layer {SOLAR_LAYER} (rows={READ_ROOFS_ROWS})")
    roofs = gpd.read_file(str(CACHED_GPKG), layer=SOLAR_LAYER, rows=READ_ROOFS_ROWS)
    roofs = ensure_lv95(roofs)

    # EGID normalization
    if "GWR_EGID" not in roofs.columns:
        raise RuntimeError(f"GWR_EGID not found in roofs columns. Columns: {roofs.columns.tolist()}")

    roofs["GWR_EGID_raw"] = roofs["GWR_EGID"]
    roofs["GWR_EGID"] = pd.to_numeric(roofs["GWR_EGID"], errors="coerce").astype("Int64")

    egid_missing_ratio = float(roofs["GWR_EGID"].isna().mean())
    log(f"Roofs loaded: {len(roofs)}")
    log(f"EGID missing ratio in loaded chunk: {egid_missing_ratio:.3f}")

    # Filter to roofs with EGID
    roofs_with_egid = roofs.dropna(subset=["GWR_EGID"]).copy()
    log(f"Roofs with EGID in loaded chunk: {len(roofs_with_egid)}")

    if len(roofs_with_egid) == 0:
        raise RuntimeError(
            "No roofs with EGID found in the first READ_ROOFS_ROWS rows. "
            "Increase READ_ROOFS_ROWS or sample differently."
        )

    # optionally random sample
    if RANDOM_SAMPLE:
        roofs_with_egid = roofs_with_egid.sample(n=min(TAKE_ROOFS, len(roofs_with_egid)), random_state=RANDOM_STATE)
    else:
        roofs_with_egid = roofs_with_egid.head(TAKE_ROOFS)

    # centroids as points for spatial join
    roofs_with_egid["centroid"] = roofs_with_egid.geometry.centroid
    roofs_pts = roofs_with_egid.set_geometry("centroid").copy()

    # -------------------------
    # 4) Spatial join centroid -> canton
    # -------------------------
    log("Spatial join: roof centroid -> canton")
    # keep original geometry too (optional)
    joined = gpd.sjoin(
        roofs_pts[["GWR_EGID", "centroid"]],
        cantons[["canton_name", "geometry"]],
        how="left",
        predicate="within",
    ).drop(columns=["index_right"], errors="ignore")

    # sanity check for canton assignment
    canton_na = float(joined["canton_name"].isna().mean())
    log(f"Canton missing ratio after join: {canton_na:.3f}")
    if canton_na > 0.2:
        log("Warning: many centroids did not fall within a canton polygon. CRS mismatch or geometry issues possible.")

    # -------------------------
    # 5) Load addresses in chunks and match by EGID
    # -------------------------
    egids = joined["GWR_EGID"].dropna().astype("Int64").unique().tolist()
    log(f"Unique EGIDs to match in address CSV: {len(egids)}")
    log(f"First EGIDs: {egids[:10]}")

    log("Loading address CSV from S3 in chunks (filtering early)")
    address_matches = []

    with fs.open(ADDRESS_CSV_S3, "rb") as f:
        reader = pd.read_csv(
            f,
            sep=ADDRESS_SEP,
            engine="python",
            on_bad_lines="skip",
            chunksize=ADDRESS_CHUNKSIZE,
            dtype=str,  # read as str first then coerce
        )

        for i, chunk in enumerate(reader, start=1):
            # cleanup headers
            chunk.columns = chunk.columns.str.strip().str.replace("\ufeff", "", regex=False)

            # detect EGID column in addresses
            if "BDG_EGID" in chunk.columns:
                addr_egid_col = "BDG_EGID"
            elif "EGID" in chunk.columns:
                addr_egid_col = "EGID"
            else:
                if i == 1:
                    raise RuntimeError(f"Could not find EGID column in address CSV. Columns: {chunk.columns.tolist()}")
                continue

            # normalize EGID
            chunk[addr_egid_col] = pd.to_numeric(chunk[addr_egid_col], errors="coerce").astype("Int64")

            sub = chunk[chunk[addr_egid_col].isin(egids)].copy()
            if not sub.empty:
                keep_cols = [addr_egid_col]
                for c in ["COM_NAME", "COM_CANTON", "ZIP_LABEL", "STR_NAME", "ADR_NUMBER", "ADR_EASTING", "ADR_NORTHING"]:
                    if c in sub.columns:
                        keep_cols.append(c)
                sub = sub[keep_cols].rename(columns={addr_egid_col: "GWR_EGID"})
                address_matches.append(sub)

                total_rows = sum(len(x) for x in address_matches)
                if total_rows >= MAX_ADDRESS_MATCH_ROWS:
                    log("Stopping early: reached MAX_ADDRESS_MATCH_ROWS safety cap.")
                    break

            # light progress
            if i % 5 == 0:
                log(f"  processed {i} chunks ... current matches: {sum(len(x) for x in address_matches)}")

    if address_matches:
        addr_df = pd.concat(address_matches, ignore_index=True)
    else:
        addr_df = pd.DataFrame(columns=["GWR_EGID"])

    log(f"Matched address rows: {len(addr_df)}")
    if len(addr_df) > 0:
        log("Address match preview:")
        log(str(addr_df.head(5)))

    # -------------------------
    # 6) Merge canton result with addresses
    # -------------------------
    out = joined.copy()
    out["GWR_EGID"] = out["GWR_EGID"].astype("Int64")
    addr_df["GWR_EGID"] = pd.to_numeric(addr_df["GWR_EGID"], errors="coerce").astype("Int64")

    out = out.merge(addr_df, on="GWR_EGID", how="left")

    # add centroid coordinates
    out["centroid_E"] = out["centroid"].x
    out["centroid_N"] = out["centroid"].y

    # final checks
    log("\n--- Final checks ---")
    log(f"Rows output: {len(out)}")
    log(f"Unique EGIDs output: {out['GWR_EGID'].nunique(dropna=True)}")
    log(f"Share with canton_name filled: {1 - float(out['canton_name'].isna().mean()):.3f}")
    if "COM_NAME" in out.columns:
        log(f"Share with COM_NAME filled: {1 - float(out['COM_NAME'].isna().mean()):.3f}")
    if "ZIP_LABEL" in out.columns:
        log(f"Share with ZIP_LABEL filled: {1 - float(out['ZIP_LABEL'].isna().mean()):.3f}")

    # pretty sample output
    cols_show = ["GWR_EGID", "canton_name", "COM_NAME", "ZIP_LABEL", "STR_NAME", "ADR_NUMBER", "centroid_E", "centroid_N"]
    cols_show = [c for c in cols_show if c in out.columns]
    log("\n--- Sample result ---")
    log(out[cols_show].head(25).to_string(index=False))

    # save result
    out_csv = CACHE_DIR / "roof_sample_with_canton_and_address.csv"
    out[cols_show].to_csv(out_csv, index=False)
    log(f"\nSaved: {out_csv}")


if __name__ == "__main__":
    main()