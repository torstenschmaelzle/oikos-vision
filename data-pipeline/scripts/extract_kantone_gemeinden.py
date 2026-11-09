import geopandas as gpd
import pandas as pd

def summarize_geom(geom):
    if geom is None or geom.is_empty:
        return {
            "geom_type": None,
            "parts": 0,
            "bounds": None,
            "area_m2": None,
        }

    bounds = geom.bounds  # (minx, miny, maxx, maxy)

    # count parts for (Multi)Polygon
    parts = 1
    if geom.geom_type == "MultiPolygon":
        parts = len(geom.geoms)

    return {
        "geom_type": geom.geom_type,
        "parts": parts,
        "bounds": f"({bounds[0]:.1f}, {bounds[1]:.1f})–({bounds[2]:.1f}, {bounds[3]:.1f})",
        "area_m2": float(geom.area),
    }

def print_cantons(gdb_path: str, layer: str = "TLM_KANTONSGEBIET", n_preview: int = 26):
    gdf = gpd.read_file(gdb_path, layer=layer)

    # Find likely name columns
    cols_lower = {c.lower(): c for c in gdf.columns}
    name_candidates = [
        "name", "name_de", "kantonsname", "kanton", "bezeichnung",
        "objname", "gemname", "kt_name", "nam"
    ]
    name_col = None
    for cand in name_candidates:
        if cand in cols_lower:
            name_col = cols_lower[cand]
            break

    # If still not found, just pick the first text column
    if name_col is None:
        text_cols = [c for c in gdf.columns if gdf[c].dtype == "object" and c != "geometry"]
        name_col = text_cols[0] if text_cols else None

    # Also look for an ID code (common ones)
    id_candidates = ["kt_kz", "kt_nr", "kantonsnummer", "id", "objectid", "uuid", "bfs_nr", "bfsnr"]
    id_col = None
    for cand in id_candidates:
        if cand in cols_lower:
            id_col = cols_lower[cand]
            break

    rows = []
    for _, r in gdf.iterrows():
        s = summarize_geom(r.geometry)
        rows.append({
            "canton_name": r[name_col] if name_col else "(name column not found)",
            "id": r[id_col] if id_col else None,
            **s
        })

    out = pd.DataFrame(rows).sort_values("canton_name")

    # Pretty print
    pd.set_option("display.max_colwidth", 120)
    pd.set_option("display.width", 160)
    print("\nCanton overview")
    print(out[["canton_name", "id", "geom_type", "parts", "area_m2", "bounds"]].head(n_preview).to_string(index=False))

    # Optional: show which columns were used
    print(f"\nDetected name column: {name_col}")
    print(f"Detected id column: {id_col}")

if __name__ == "__main__":
    gdb_path = "/var/folders/mj/24_fhfyx7qz3h3m2t_23whxr0000gn/T/swissboundaries_icjhzzas/swissBOUNDARIES3D_1_5_LV95_LN02.gdb"
    print_cantons(gdb_path)