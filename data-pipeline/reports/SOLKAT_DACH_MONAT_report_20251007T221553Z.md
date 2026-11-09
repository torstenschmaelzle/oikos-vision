# Dataset Report

- Source file: `s3://oikosdata/unzipped/SOLKAT_DACH_MONAT.gpkg`
- File size: 12.16 GB
- Generated: 2025-10-07T22:15:53Z

## GeoPackage Summary
- Layers: 2

### SOLKAT_CH_DACH_MONAT
- data_type: `attributes`
- identifier: `SOLKAT_CH_DACH_MONAT`
- rows: 120861060
- srs: Undefined geographic SRS (NONE:0)

#### Columns
| cid | name | type | notnull | default | pk |
|---:|---|---|:---:|---|:---:|
| 0 | objectid | INTEGER | True | None | True |
| 1 | DF_UID | INTEGER | False | None | False |
| 2 | DF_NUMMER | SMALLINT | False | None | False |
| 3 | SB_UUID | TEXT | False | None | False |
| 4 | MONAT | SMALLINT | False | None | False |
| 5 | MSTRAHLUNG_MONAT | REAL | False | None | False |
| 6 | A_PARAM | REAL | False | None | False |
| 7 | B_PARAM | REAL | False | None | False |
| 8 | C_PARAM | REAL | False | None | False |
| 9 | HEIZGRADTAGE | SMALLINT | False | None | False |
| 10 | MTEMP_MONAT | FLOAT | False | None | False |
| 11 | STROMERTRAG_MONAT | SMALLINT | False | None | False |

### MONAT
- data_type: `attributes`
- identifier: `MONAT`
- rows: 12
- srs: Undefined geographic SRS (NONE:0)

#### Columns
| cid | name | type | notnull | default | pk |
|---:|---|---|:---:|---|:---:|
| 0 | code | INTEGER | True | None | True |
| 1 | Beschreibung_Wert | TEXT | False | None | False |
