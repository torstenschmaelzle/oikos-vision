"""
GWR (Gebäude- und Wohnungsregister) code → label maps and shared filter helpers.

These are Swiss federal standard codes — they don't change.  Keeping them here
as Python constants avoids round-trips to the DB and makes them available to
any router or service.
"""
from typing import List, Optional, Tuple

# ── Building category (gkat) ──────────────────────────────────────────────────

GKAT_LABELS = {
    1010: "Provisorisches Gebäude",
    1020: "Wohngebäude",
    1030: "Gebäude mit Wohnanteil",
    1040: "Gebäude ohne Wohnanteil",
    1060: "Sonstige Gebäude",
    1080: "Gebäude mit besonderer Nutzung",
}

# ── Building class (gklas) ────────────────────────────────────────────────────

GKLAS_LABELS = {
    1110: "Einfamilienhaus",
    1121: "EFH mit Einliegerwohnung",
    1122: "Doppelhaus / Reihenhaus",
    1130: "Mehrfamilienhaus (3–6 Wohnungen)",
    1211: "Hotelgebäude",
    1212: "Gastgewerbegebäude",
    1220: "Büro- / Verwaltungsgebäude",
    1230: "Handels- / Lagergebäude",
    1231: "Einkaufszentrum",
    1241: "Werkstattgebäude",
    1242: "Industrie- / Gewerbegebäude",
    1251: "Schulgebäude",
    1252: "Universitätsgebäude",
    1261: "Krankenhaus",
    1262: "Pflegeheim",
    1263: "Soziales Gebäude",
    1264: "Sportstätte",
    1265: "Freizeitgebäude",
    1271: "Lagergebäude",
    1272: "Tiefgarage / Parkhaus",
    1274: "Landwirtschaftliches Wohngebäude",
    1275: "Treibhaus",
    1276: "Stallgebäude",
    1277: "Scheune",
    1278: "Landwirtschaftl. Betriebsgebäude",
}

# ── Energy source for heating (genh1) ────────────────────────────────────────

GENH1_LABELS = {
    7500: "Elektrizität",
    7501: "Wärmepumpe",
    7510: "Gas (allg.)",
    7511: "Erdgas",
    7512: "Flüssiggas",
    7520: "Heizöl",
    7530: "Holz",
    7540: "Fernwärme",
    7541: "Nahwärme",
    7542: "Abwärme",
    7560: "Kohle",
    7570: "Sonne (thermisch)",
    7580: "Sonne (PV)",
    7598: "Unbekannt",
    7599: "Keine",
}

# ── Roof object type (oikos.sb_objektart) ─────────────────────────────────────
# Loaded from the DB query; kept here to avoid per-request lookups.

SB_OBJEKTART_LABELS = {
    0:  "Brücke gedeckt",
    1:  "Gebäude Einzelhaus",
    2:  "Hochhaus",
    3:  "Hochkamin",
    4:  "Turm",
    5:  "Kühlturm",
    6:  "Lagertank",
    7:  "Lüftungsschacht",
    8:  "Offenes Gebäude",
    9:  "Treibhaus",
    10: "Im Bau",
    11: "Kapelle",
    12: "Sakraler Turm",
    13: "Sakrales Gebäude",
    15: "Flugdach",
    16: "Unterirdisches Gebäude",
    17: "Mauer gross",
    18: "Mauer gross gedeckt",
    19: "Historische Baute",
    20: "Gebäude unsichtbar",
    22: "Verbindungsbrücke",
}

# ── Renovation targeting ──────────────────────────────────────────────────────
# Fossil fuel energy source codes (gas + oil) — primary heating-swap targets.
FOSSIL_FUEL_GENH1 = (7511, 7512, 7520)

# Standard baujahr era buckets for histogram display.
# Each entry: (label, min_year_inclusive_or_None, max_year_inclusive_or_None)
BAUJAHR_ERAS: List[Tuple[str, Optional[int], Optional[int]]] = [
    ("pre-1919",  None, 1919),
    ("1920-1945", 1920, 1945),
    ("1946-1980", 1946, 1980),
    ("1981-2000", 1981, 2000),
    ("2001-2010", 2001, 2010),
    ("2011+",     2011, None),
]


# ── Filter builder ────────────────────────────────────────────────────────────

def build_address_filter(
    *,
    gkat: Optional[List[int]] = None,
    gklas: Optional[List[int]] = None,
    genh1: Optional[List[int]] = None,
    baujahr_min: Optional[int] = None,
    baujahr_max: Optional[int] = None,
    ggesh_min: Optional[int] = None,
    ggesh_max: Optional[int] = None,
    sb_objektart: Optional[List[int]] = None,
    addr_alias: str = "a",
) -> Tuple[List[str], List]:
    """
    Build parameterised WHERE conditions for GWR address-level filters.

    Returns (conditions, params):
      - conditions: SQL fragment strings, safe to inject with AND (no user
        data is interpolated — all values go through %s placeholders)
      - params: matching parameter list, in the same order

    ``addr_alias`` is the SQL alias for oikos.addresses in the calling query;
    it must be a trusted, hardcoded string — never pass user input here.
    """
    conds: List[str] = []
    params: List = []
    p = addr_alias

    if gkat:
        conds.append(f"{p}.gkat = ANY(%s)")
        params.append(gkat)
    if gklas:
        conds.append(f"{p}.gklas = ANY(%s)")
        params.append(gklas)
    if genh1:
        conds.append(f"{p}.genh1 = ANY(%s)")
        params.append(genh1)
    if baujahr_min is not None:
        conds.append(f"{p}.gbauj >= %s")
        params.append(baujahr_min)
    if baujahr_max is not None:
        conds.append(f"{p}.gbauj <= %s")
        params.append(baujahr_max)
    if ggesh_min is not None:
        conds.append(f"{p}.ggesh >= %s")
        params.append(ggesh_min)
    if ggesh_max is not None:
        conds.append(f"{p}.ggesh <= %s")
        params.append(ggesh_max)
    if sb_objektart:
        # Subquery into oikos.roofs — alias r__sb avoids conflicts with outer
        # queries that already use "r" for roof_agg_by_egid.
        conds.append(
            f"EXISTS ("
            f"SELECT 1 FROM oikos.roofs r__sb"
            f" WHERE r__sb.gwr_egid::bigint = {p}.bdg_egid"
            f" AND r__sb.sb_objektart = ANY(%s)"
            f")"
        )
        params.append(sb_objektart)

    return conds, params


def label_building_row(row: dict) -> dict:
    """
    Enrich a building result dict with human-readable label fields.

    Works on any row that contains the GWR code columns (gkat, gklas,
    genh1, gwaerzh1, sb_objektart_code).  Missing keys are silently skipped.
    Returns a new dict — does not mutate the original.
    """
    out = dict(row)
    if "gkat" in row:
        out["gkat_label"] = GKAT_LABELS.get(row["gkat"])
    if "gklas" in row:
        out["gklas_label"] = GKLAS_LABELS.get(row["gklas"])
    if "genh1" in row:
        out["genh1_label"] = GENH1_LABELS.get(row["genh1"])
    if "gwaerzh1" in row:
        out["gwaerzh1_label"] = GENH1_LABELS.get(row["gwaerzh1"])
    if "sb_objektart_code" in row:
        out["sb_objektart_label"] = SB_OBJEKTART_LABELS.get(row["sb_objektart_code"])
    return out
