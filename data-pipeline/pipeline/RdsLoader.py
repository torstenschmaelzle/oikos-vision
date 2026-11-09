

from dataset_spec import DatasetSpec
from dataset_spec import TableSpec
from sqlite_conn import SqliteConn
from Logger import log
from pathlib import Path
import sqlite3
from postgres_conn import PostgresConn
import psycopg2
import psycopg2.extras
import struct
import time


# MAKE RESTISTEN AGAINST 
# except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:

class RdsLoader:

    def __init__(self,dataset:DatasetSpec,source_path:str):
        
        self.dataset = dataset
        self.sqlite_conn = SqliteConn(source_path).connect()
        self.pg_conn = PostgresConn().connect()
    
    def table_exists(self, table:str):

        cur = self.sqlite_conn.cursor()
        cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name =? LIMIT 1;",
            (table,),
        )

        return cur.fetchone() is not None
    
    def table_columns_exist(self,table_name:str,columns:list[str]):

        cur = self.sqlite_conn.cursor()
        cur.execute(f"PRAGMA table_info('{table_name}');")
        rows = cur.fetchall()

        col_names = {r[1] for r in rows}
        missing = sorted(set(columns) - col_names)

        return (len(missing) == 0), missing 
   
    def check_table_existence(self, table:TableSpec):

        table_name = table.source_table
        columns = list(table.column_mapping.keys())

        exists = self.table_exists(table_name)
        if not exists:
            log.error("=== ERROR === table=%s was not found",table_name)
            raise RuntimeError(f"table not found: {table_name}")
        
        ok, missing = self.table_columns_exist(table_name,columns)
        if not ok:
            log.error("=== ERROR === columns=%s were not found in table=%s",missing,table_name)
            raise RuntimeError(f"columns {missing} not found in table {table_name}")

    def load_table(self, table: TableSpec):
        log.info("=== LOAD TABLE START === src=%s -> dst=oikos.%s", table.source_table, table.target_table)
        t0 = time.time()

        self.check_table_existence(table)

        src_table = table.source_table
        dst_table = table.target_table
        mapping = table.column_mapping

        src_cols = list(mapping.keys())
        dst_cols = [mapping[c] for c in src_cols]

        geom_idx = src_cols.index("geom") if "geom" in src_cols else None

        SRID = 2056
        LIMIT_STEP = 100000     # so wie du gesagt hast
        page_size = 20_000         # execute_values batching

        def q_ident_sqlite(name: str) -> str:
            # SQLite identifier quoting with double quotes
            return '"' + name.replace('"', '""') + '"'

        def q_ident_pg(name: str) -> str:
            # Postgres identifier quoting with double quotes
            return '"' + name.replace('"', '""') + '"'

        select_cols_sql = ", ".join(q_ident_sqlite(c) for c in src_cols)
        from_table_sql = q_ident_sqlite(src_table)

        insert_cols_sql = ", ".join(q_ident_pg(c) for c in dst_cols)
        insert_sql = f'INSERT INTO oikos.{q_ident_pg(dst_table)} ({insert_cols_sql}) VALUES %s'

        # per-column template, geometry gets a cast
        template_parts = []
        for i in range(len(dst_cols)):
            if geom_idx is not None and i == geom_idx:
                template_parts.append(f"ST_GeomFromWKB(%s,{SRID})::geometry(MultiLineString,{SRID})")
            else:
                template_parts.append("%s")
        template = "(" + ", ".join(template_parts) + ")"

        sqlite_cur = self.sqlite_conn.cursor()
        pg_cur = self.pg_conn.cursor()

        offset = 0
        total = 0
        chunk = 0

        try:
            while True:
                chunk += 1
                log.info("Chunk=%d FETCH offset=%d limit=%d from %s", chunk, offset, LIMIT_STEP, src_table)

                sqlite_cur.execute(
                    f"SELECT {select_cols_sql} FROM {from_table_sql} LIMIT ? OFFSET ?;",
                    (LIMIT_STEP, offset),
                )
                rows = sqlite_cur.fetchall()
                if not rows:
                    break

                attempt = 0
                MAX_RETRIES = 50
                while True:
                    try:
                        values = []
                        for r in rows:
                            r = list(r)
                            if geom_idx is not None and r[geom_idx] is not None:
                                r[geom_idx] = psycopg2.Binary(self.gpkg_blob_to_wkb(r[geom_idx]))
                            values.append(tuple(r))

                        log.info("Chunk=%d INSERT rows=%d into oikos.%s", chunk, len(values), dst_table)
                        psycopg2.extras.execute_values(
                            pg_cur,
                            insert_sql,
                            values,
                            template=template,
                            page_size=page_size,
                        )
                        self.pg_conn.commit()
                        total += len(values)
                        offset += LIMIT_STEP
                        log.info("Chunk=%d DONE total=%d next_offset=%d", chunk, total, offset)

                    except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:

                        log.exception("==== PG CONNECTION ERROR, RECONNECT INITIALIZED ==== exception=%s",e)
                        attempt +=1
                        if attempt > MAX_RETRIES:
                            raise
                        self.reconnect_pg()
                        pg_cur = self.pg_conn.cursor()
                        time.sleep(5)

            log.info("=== LOAD TABLE DONE === src=%s -> dst=oikos.%s total=%d elapsed_s=%.2f",
                    src_table, dst_table, total, time.time() - t0)

        except Exception:
            log.exception("=== LOAD TABLE FAILED === src=%s -> dst=oikos.%s offset=%d total=%d",
                        src_table, dst_table, offset, total)
            raise
        finally:
            try: pg_cur.close()
            except Exception: pass
            try: sqlite_cur.close()
            except Exception: pass
            
    def gpkg_blob_to_wkb(self, gpkg_blob: bytes) -> bytes:
        # Logging hier nur bei Fehlern sinnvoll, sonst spammt es (läuft pro Row!)
        if gpkg_blob is None:
            return None
        if len(gpkg_blob) < 8:
            raise ValueError("GPKG geom blob too small")
        if gpkg_blob[0:2] != b"GP":
            raise ValueError("Not a GeoPackage geometry blob (missing 'GP' magic)")

        flags = gpkg_blob[3]
        envelope_type = (flags >> 1) & 0x07

        envelope_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
        env_size = envelope_sizes.get(envelope_type)
        if env_size is None:
            raise ValueError(f"Unsupported GPKG envelope type: {envelope_type}")

        wkb_offset = 8 + env_size
        if len(gpkg_blob) <= wkb_offset:
            raise ValueError("GPKG geom blob has no WKB payload")

        return gpkg_blob[wkb_offset:]

    def load_dataset(self, ):

        log.info("=== LOAD DATASET START === dataset=%s tables=%d", self.dataset.dataset_name, len(self.dataset.tables))

        t0 = time.time()
        ok = 0
        try:
            for spec in self.dataset.tables:
                log.info("Dataset=%s next_table=%s", self.dataset.dataset_name, spec.source_table)
                self.load_table(spec)
                ok += 1

            log.info(
                "=== LOAD DATASET DONE === dataset=%s loaded_tables=%d elapsed_s=%.2f",
                self.dataset.dataset_name, ok, time.time() - t0
            )
        except Exception:
            log.exception(
                "=== LOAD DATASET FAILED === dataset=%s loaded_tables=%d elapsed_s=%.2f",
                self.dataset.dataset_name, ok, time.time() - t0
            )
            raise

    def reconnect_pg(self):

            try:
                self.pg_conn.close()

            except Exception as e:
                log.exception("=== COULDNT CLOSE PG CONNECTION PROPERLY === exception=%s",e)
                pass

            self.pg_conn = PostgresConn().connect()
            log.info("==== RECONNECTION SUCCESSFUL === ")
        






        