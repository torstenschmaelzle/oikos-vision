#!/usr/bin/env python3
import argparse
import csv
import io
import json
import math
import os
import re
import sqlite3
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Optional: boto3 only needed if you pass an s3:// URL
try:
    import boto3  # type: ignore
except Exception:
    boto3 = None  # we will error nicely if user passes s3:// without boto3 installed

# Optional: pandas for CSV statistics (streamed)
try:
    import pandas as pd  # type: ignore
except Exception:
    pd = None


def is_s3_path(p: str) -> bool:
    return p.lower().startswith("s3://")


def parse_s3_url(url: str) -> Tuple[str, str]:
    # s3://bucket/key  -> (bucket, key)
    m = re.match(r"^s3://([^/]+)/(.+)$", url.strip())
    if not m:
        raise ValueError(f"Invalid S3 URL: {url}")
    return m.group(1), m.group(2)


def download_s3_to_temp(s3_url: str) -> str:
    if boto3 is None:
        raise RuntimeError("boto3 is required for s3:// paths. Install boto3 or use a local file path.")
    bucket, key = parse_s3_url(s3_url)
    session = boto3.session.Session()
    s3 = session.client("s3")
    tmpdir = tempfile.mkdtemp(prefix="report7_")
    local = os.path.join(tmpdir, os.path.basename(key))
    s3.download_file(bucket, key, local)
    return local


def human_bytes(n: int) -> str:
    if n is None:
        return "n/a"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    f = float(n)
    while f >= 1024 and i < len(units) - 1:
        f /= 1024.0
        i += 1
    return f"{f:.2f} {units[i]}"


def ensure_dir(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)

def summarize_csv(local_path: str,
                  chunksize: int = 100_000,
                  max_unique_per_col: int = 50_000,
                  csv_sep: str = "auto",
                  csv_encoding: str = "auto",
                  csv_on_bad_lines: str = "warn") -> Dict:
    if pd is None:
        raise RuntimeError("pandas is required to summarize CSV files. Please `pip install pandas`.")

    # Try a few combos until one works
    seps = ["auto", ",", ";", "\t", "|"] if csv_sep == "auto" else [csv_sep]
    encs = ["utf-8", "utf-8-sig", "latin1"] if csv_encoding == "auto" else [csv_encoding]

    reader = None
    last_err = None
    for enc in encs:
        for sep in seps:
            try:
                kw = dict(
                    chunksize=chunksize,
                    low_memory=True,
                    encoding=enc,
                    on_bad_lines=csv_on_bad_lines  # 'warn' or 'skip' keeps going
                )
                if sep == "auto":
                    # Use Python engine + sep=None to sniff delimiter
                    kw.update(engine="python", sep=None)
                else:
                    # Use fast engine; if it fails, we'll retry with python
                    kw.update(sep=sep)
                reader = pd.read_csv(local_path, **kw)
                # Test one chunk to validate settings; then rebuild reader for full pass
                _ = next(reader)
                # Recreate reader from start with the same kwargs
                reader = pd.read_csv(local_path, **kw)
                print(f"CSV parse settings: encoding={enc}, sep={'auto' if sep=='auto' else repr(sep)}, on_bad_lines={csv_on_bad_lines}")
                last_err = None
                break
            except Exception as e:
                last_err = e
                reader = None
                continue
        if reader is not None:
            break

    if reader is None:
        raise RuntimeError(f"Could not parse CSV with tried settings. Last error: {last_err}")

    total_rows = 0
    header: List[str] = []
    non_null: Dict[str, int] = {}
    numeric_min: Dict[str, float] = {}
    numeric_max: Dict[str, float] = {}
    numeric_sum: Dict[str, float] = {}
    numeric_count: Dict[str, int] = {}
    str_len_sum: Dict[str, int] = {}
    str_count: Dict[str, int] = {}
    uniques: Dict[str, set] = {}
    uniques_overflow: Dict[str, bool] = {}

    for chunk in reader:
        if not header:
            header = list(chunk.columns)
            for col in header:
                non_null[col] = 0
                numeric_min[col] = math.inf
                numeric_max[col] = -math.inf
                numeric_sum[col] = 0.0
                numeric_count[col] = 0
                str_len_sum[col] = 0
                str_count[col] = 0
                uniques[col] = set()
                uniques_overflow[col] = False

        total_rows += len(chunk)

        for col in header:
            non_null[col] += chunk[col].notna().sum()

        for col in header:
            num = pd.to_numeric(chunk[col], errors="coerce")
            nn = num.notna()
            if nn.any():
                series = num[nn]
                cmin = float(series.min())
                cmax = float(series.max())
                numeric_min[col] = min(numeric_min[col], cmin)
                numeric_max[col] = max(numeric_max[col], cmax)
                numeric_sum[col] += float(series.sum())
                numeric_count[col] += int(nn.sum())

        for col in header:
            s = chunk[col].dropna().astype(str)
            if len(s) > 0:
                str_len_sum[col] += int(s.str.len().sum())
                str_count[col] += int(len(s))

        for col in header:
            if uniques_overflow[col]:
                continue
            s = chunk[col].dropna().astype(str)
            if len(uniques[col]) < max_unique_per_col:
                uniques[col].update(s.head(max_unique_per_col - len(uniques[col])))
            if len(uniques[col]) >= max_unique_per_col:
                uniques_overflow[col] = True

    columns_summary = []
    for col in header:
        col_non_null = int(non_null[col])
        col_null = int(total_rows - col_non_null)
        num_cnt = numeric_count[col]
        avg = numeric_sum[col] / num_cnt if num_cnt > 0 else None
        avg_strlen = (str_len_sum[col] / str_count[col]) if str_count[col] > 0 else None
        unique_val = f">={max_unique_per_col}" if uniques_overflow[col] else len(uniques[col])
        columns_summary.append({
            "name": col,
            "non_null": col_non_null,
            "null": col_null,
            "unique": unique_val,
            "numeric_min": None if numeric_min[col] is math.inf else numeric_min[col],
            "numeric_max": None if numeric_max[col] is -math.inf else numeric_max[col],
            "numeric_mean": avg,
            "avg_string_length": avg_strlen,
        })

    return {
        "type": "csv",
        "rows": int(total_rows),
        "columns": header,
        "column_stats": columns_summary,
    }



def summarize_gpkg(local_path: str) -> Dict:
    if not os.path.exists(local_path):
        raise FileNotFoundError(local_path)

    conn = sqlite3.connect(local_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # gpkg_contents lists layers/tables
    cur.execute("""
        SELECT table_name, data_type, identifier, description,
               last_change, min_x, min_y, max_x, max_y, srs_id
        FROM gpkg_contents
    """)
    contents = [dict(row) for row in cur.fetchall()]

    # geometry columns info
    cur.execute("""
        SELECT table_name, column_name, geometry_type_name, srs_id, z, m
        FROM gpkg_geometry_columns
    """)
    geom_cols = {}
    for row in cur.fetchall():
        geom_cols.setdefault(row["table_name"], []).append(dict(row))

    # srs names
    cur.execute("""SELECT srs_id, srs_name, organization, organization_coordsys_id
                   FROM gpkg_spatial_ref_sys""")
    srs_lookup = {r["srs_id"]: dict(r) for r in cur.fetchall()}

    layers = []
    for entry in contents:
        tname = entry["table_name"]
        # columns via PRAGMA
        cur.execute(f"PRAGMA table_info('{tname}')")
        cols = [dict(row) for row in cur.fetchall()]

        # row count
        try:
            cur.execute(f"SELECT COUNT(1) as cnt FROM '{tname}'")
            row_cnt = cur.fetchone()["cnt"]
        except sqlite3.DatabaseError:
            row_cnt = None

        # attach geometry info, bbox, srs
        geom = geom_cols.get(tname, [])
        srs = srs_lookup.get(entry["srs_id"]) if entry.get("srs_id") is not None else None

        layers.append({
            "table_name": tname,
            "data_type": entry["data_type"],
            "identifier": entry.get("identifier"),
            "description": entry.get("description"),
            "rows": row_cnt,
            "bbox": {
                "min_x": entry.get("min_x"),
                "min_y": entry.get("min_y"),
                "max_x": entry.get("max_x"),
                "max_y": entry.get("max_y"),
            },
            "srs": srs,
            "geometry_columns": geom,
            "columns": [{
                "cid": c["cid"],
                "name": c["name"],
                "type": c["type"],
                "notnull": bool(c["notnull"]),
                "default": c["dflt_value"],
                "pk": bool(c["pk"]),
            } for c in cols],
        })

    conn.close()
    return {
        "type": "gpkg",
        "layers": layers,
    }


def write_markdown(report_path: Path, summary: Dict, src_path: str, file_size: int) -> None:
    lines: List[str] = []
    lines.append(f"# Dataset Report")
    lines.append("")
    lines.append(f"- Source file: `{src_path}`")
    lines.append(f"- File size: {human_bytes(file_size)}")
    lines.append(f"- Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z")
    lines.append("")

    if summary["type"] == "csv":
        lines.append("## CSV Summary")
        lines.append(f"- Rows: {summary['rows']}")
        lines.append(f"- Columns: {len(summary['columns'])}")
        lines.append("")
        lines.append("### Columns")
        lines.append("| name | non_null | null | unique | numeric_min | numeric_max | numeric_mean | avg_string_length |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|---:|")
        for c in summary["column_stats"]:
            lines.append(
                f"| {c['name']} | {c['non_null']} | {c['null']} | {c['unique']} | "
                f"{'' if c['numeric_min'] is None else c['numeric_min']} | "
                f"{'' if c['numeric_max'] is None else c['numeric_max']} | "
                f"{'' if c['numeric_mean'] is None else round(c['numeric_mean'], 6)} | "
                f"{'' if c['avg_string_length'] is None else round(c['avg_string_length'], 2)} |"
            )

    elif summary["type"] == "gpkg":
        lines.append("## GeoPackage Summary")
        lines.append(f"- Layers: {len(summary['layers'])}")
        lines.append("")
        for lyr in summary["layers"]:
            lines.append(f"### {lyr['table_name']}")
            lines.append(f"- data_type: `{lyr['data_type']}`")
            if lyr.get("identifier"):
                lines.append(f"- identifier: `{lyr['identifier']}`")
            if lyr.get("description"):
                lines.append(f"- description: {lyr['description']}")
            if lyr.get("rows") is not None:
                lines.append(f"- rows: {lyr['rows']}")
            bbox = lyr.get("bbox") or {}
            if any(v is not None for v in bbox.values()):
                lines.append(f"- bbox: {bbox}")
            srs = lyr.get("srs")
            if srs:
                lines.append(f"- srs: {srs.get('srs_name')} ({srs.get('organization')}:{srs.get('organization_coordsys_id')})")
            if lyr.get("geometry_columns"):
                lines.append("- geometry_columns:")
                for g in lyr["geometry_columns"]:
                    lines.append(f"  - {g['column_name']}: {g['geometry_type_name']} (srs_id={g['srs_id']}, z={g['z']}, m={g['m']})")
            lines.append("")
            lines.append("#### Columns")
            lines.append("| cid | name | type | notnull | default | pk |")
            lines.append("|---:|---|---|:---:|---|:---:|")
            for c in lyr["columns"]:
                lines.append(f"| {c['cid']} | {c['name']} | {c['type']} | {str(c['notnull'])} | {c['default']} | {str(c['pk'])} |")
            lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Create a dataset report (CSV or GPKG).")
    parser.add_argument("path", help="Local file path or s3://bucket/key to a .csv or .gpkg file")
    parser.add_argument("--output-dir", default="report7", help="Directory to write the report files")
    parser.add_argument("--chunksize", type=int, default=100_000, help="CSV chunksize for streaming")
    parser.add_argument("--max-unique", type=int, default=50_000, help="Approx cap for per-column unique counting")
    args = parser.parse_args()

    # Resolve to local path (download from S3 if needed)
    src_path = args.path
    local_path = src_path
    cleanup = False
    if is_s3_path(src_path):
        local_path = download_s3_to_temp(src_path)
        cleanup = True

    p = Path(local_path)
    if not p.exists():
        print(f"File not found: {src_path}", file=sys.stderr)
        sys.exit(2)

    out_dir = Path(args.output_dir)
    ensure_dir(out_dir)

    file_size = os.path.getsize(local_path)
    ext = p.suffix.lower()

    if ext == ".csv":
        summary = summarize_csv(local_path, chunksize=args.chunksize, max_unique_per_col=args.max_unique)
    elif ext == ".gpkg":
        summary = summarize_gpkg(local_path)
    else:
        print(f"Unsupported file type: {ext}. Only .csv and .gpkg are supported.", file=sys.stderr)
        sys.exit(3)

    base = p.stem  # file name without extension
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    md_path = out_dir / f"{base}_report_{timestamp}.md"
    json_path = out_dir / f"{base}_summary_{timestamp}.json"

    write_markdown(md_path, summary, src_path, file_size)
    json_path.write_text(json.dumps({
        "source": src_path,
        "file_size_bytes": file_size,
        "file_size_human": human_bytes(file_size),
        "generated_utc": timestamp,
        "summary": summary
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote Markdown report: {md_path}")
    print(f"Wrote JSON summary:   {json_path}")

    if cleanup:
        try:
            os.remove(local_path)
        except Exception:
            pass


if __name__ == "__main__":
    main()