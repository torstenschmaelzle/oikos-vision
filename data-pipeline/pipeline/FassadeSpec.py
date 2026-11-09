

cat > FassadeSpec.py << 'PY'
from dataset_spec import TableSpec
from dataset_spec import DatasetSpec


EIGNUNG_FASSADE = TableSpec(
    source_table="EIGNUNG_FASS",
    target_table="fassade_eignung",
    column_mapping={
        "code": "code",
        "Beschreibung_Wert": "beschreibung_wert",
        "Abhängigkeit zu MSTRAHLUNG": "abhaengigkeit_mstrahlung",  # <- so!
    },
    chunk_key="code",
    order_by="code",
)

SB_OBJEKTART = TableSpec(
    source_table="SB_OBJEKTART",
    target_table="sb_objektart",
    column_mapping={

        "code": "code",
        "Beschreibung_Wert": "beschreibung_wert",

    },
    chunk_key = "code",
    order_by = "code"
)

FASSADE = TableSpec(
    source_table="SOLKAT_CH_FASS",
    target_table="fassaden",
    column_mapping={
        "objectid": "objectid",
        "FF_UID": "df_uid",
        "FF_NUMMER": "df_nummer",
        "DATUM_ERSTELLUNG": "datum_erstellung",
        "DATUM_AENDERUNG": "datum_aenderung",
        "SB_UUID": "sb_uuid",
        "SB_OBJEKTART": "sb_objektart",
        "SB_DATUM_ERSTELLUNG": "sb_datum_erstellung",
        "SB_DATUM_AENDERUNG": "sb_datum_aenderung",
        "KLASSE": "klasse",
        "FLAECHE": "flaeche",
        "AUSRICHTUNG": "ausrichtung",
        "MSTRAHLUNG": "mstrahlung",
        "GSTRAHLUNG": "gstrahlung",
        "STROMERTRAG": "stromertrag",
        "STROMERTRAG_SOMMERHALBJAHR": "stromertrag_sommerhalbjahr",
        "STROMERTRAG_WINTERHALBJAHR": "stromertrag_winterhalbjahr",
        "WAERMEERTRAG": "waermeertrag",
        "DUSCHGAENGE": "duschgaenge",
        "DG_HEIZUNG": "dg_heizung",
        "DG_WAERMEBEDARF": "dg_waermebedarf",
        "BEDARF_WARMWASSER": "bedarf_warmwasser",
        "BEDARF_HEIZUNG": "bedarf_heizung",
        "FLAECHE_KOLLEKTOREN": "flaeche_kollektoren",
        "VOLUMEN_SPEICHER": "volumen_speicher",
        "GWR_EGID": "gwr_egid",
        "geom": "geom",
    },
    chunk_key = "objectid",
    order_by = "objectid"

)

FASSADE_DATASET = DatasetSpec(
    dataset_name="fassaden_dataset",
    tables = [EIGNUNG_FASSADE,SB_OBJEKTART,FASSADE]

)

PY