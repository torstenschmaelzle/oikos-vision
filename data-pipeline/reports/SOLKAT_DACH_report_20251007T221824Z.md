# Dataset Report

- Source file: `s3://oikosdata/unzipped/SOLKAT_DACH.gpkg`
- File size: 4.27 GB
- Generated: 2025-10-07T22:18:24Z

## GeoPackage Summary
- Layers: 3

### SOLKAT_CH_DACH
- data_type: `features`
- identifier: `SOLKAT_CH_DACH`
- rows: 10071755
- bbox: {'min_x': 2486036.109999999, 'min_y': 1075234.921, 'max_x': 2833435.954, 'max_y': 1295319.094999998}
- srs: CH1903+ / LV95 (EPSG:2056)
- geometry_columns:
  - geom: MULTIPOLYGON (srs_id=2056, z=0, m=0)

#### Columns
| cid | name | type | notnull | default | pk |
|---:|---|---|:---:|---|:---:|
| 0 | objectid | INTEGER | True | None | True |
| 1 | geom | MULTIPOLYGON | False | None | False |
| 2 | DF_UID | INTEGER | False | None | False |
| 3 | DF_NUMMER | SMALLINT | False | None | False |
| 4 | DATUM_ERSTELLUNG | DATETIME | False | None | False |
| 5 | DATUM_AENDERUNG | DATETIME | False | None | False |
| 6 | SB_UUID | TEXT | False | None | False |
| 7 | SB_OBJEKTART | SMALLINT | False | None | False |
| 8 | SB_DATUM_ERSTELLUNG | DATETIME | False | None | False |
| 9 | SB_DATUM_AENDERUNG | DATETIME | False | None | False |
| 10 | KLASSE | SMALLINT | False | None | False |
| 11 | FLAECHE | REAL | False | None | False |
| 12 | AUSRICHTUNG | SMALLINT | False | None | False |
| 13 | NEIGUNG | SMALLINT | False | None | False |
| 14 | MSTRAHLUNG | SMALLINT | False | None | False |
| 15 | GSTRAHLUNG | MEDIUMINT | False | None | False |
| 16 | STROMERTRAG | MEDIUMINT | False | None | False |
| 17 | STROMERTRAG_SOMMERHALBJAHR | MEDIUMINT | False | None | False |
| 18 | STROMERTRAG_WINTERHALBJAHR | MEDIUMINT | False | None | False |
| 19 | WAERMEERTRAG | MEDIUMINT | False | None | False |
| 20 | DUSCHGAENGE | SMALLINT | False | None | False |
| 21 | DG_HEIZUNG | SMALLINT | False | None | False |
| 22 | DG_WAERMEBEDARF | SMALLINT | False | None | False |
| 23 | BEDARF_WARMWASSER | MEDIUMINT | False | None | False |
| 24 | BEDARF_HEIZUNG | MEDIUMINT | False | None | False |
| 25 | FLAECHE_KOLLEKTOREN | REAL | False | None | False |
| 26 | VOLUMEN_SPEICHER | MEDIUMINT | False | None | False |
| 27 | GWR_EGID | MEDIUMINT | False | None | False |

### EIGNUNG_DACH
- data_type: `attributes`
- identifier: `EIGNUNG_DACH`
- rows: 5
- srs: Undefined geographic SRS (NONE:0)

#### Columns
| cid | name | type | notnull | default | pk |
|---:|---|---|:---:|---|:---:|
| 0 | code | INTEGER | True | None | True |
| 1 | Beschreibung_Wert | TEXT | False | None | False |
| 2 | Abhängigkeit zu MSTRAHLUNG | TEXT | False | None | False |

### SB_OBJEKTART
- data_type: `attributes`
- identifier: `SB_OBJEKTART`
- rows: 23
- srs: Undefined geographic SRS (NONE:0)

#### Columns
| cid | name | type | notnull | default | pk |
|---:|---|---|:---:|---|:---:|
| 0 | code | INTEGER | True | None | True |
| 1 | Beschreibung_Wert | TEXT | False | None | False |
