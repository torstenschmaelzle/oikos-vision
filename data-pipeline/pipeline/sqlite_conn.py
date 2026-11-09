cat > sqlite_conn.py << 'PY'

import sqlite3
from pathlib import Path


class SqliteConn:
    def __init__ (self,source_path):
        self.source_path = (Path(__file__).resolve().parent / source_path).resolve()


    def connect(self):
        conn = sqlite3.connect(str(self.source_path))
        conn.row_factory = sqlite3.Row 

        return conn 


PY    
