
cat >dataset_spec.py << 'PY'

from dataclasses import dataclass


@dataclass
class TableSpec:

    source_table:str
    target_table:str
    column_mapping:dict
    chunk_key:str
    order_by:str



@dataclass
class DatasetSpec:

    dataset_name:str
    tables:list[TableSpec]

PY