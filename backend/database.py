
import json
import threading
from typing import Dict, Any, Optional, Callable

import boto3
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from config import settings

_secret_lock = threading.Lock()
_cached_secret: Optional[Dict[str, Any]] = None
_pool: Optional[ThreadedConnectionPool] = None


def get_db_secret(force_refresh: bool = False) -> Dict[str, Any]:
    global _cached_secret
    if not settings.SECRET_ID:
        raise RuntimeError("OIKOS_DB_SECRET_ID is not set")

    with _secret_lock:
        if _cached_secret is not None and not force_refresh:
            return _cached_secret

        sm = boto3.client("secretsmanager", region_name=settings.AWS_REGION)
        resp = sm.get_secret_value(SecretId=settings.SECRET_ID)
        secret_str = resp.get("SecretString")
        if not secret_str:
            raise RuntimeError("SecretString missing from Secrets Manager response")

        _cached_secret = json.loads(secret_str)
        return _cached_secret


def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    try:
        _pool.closeall()
    except Exception:
        pass
    _pool = None


def init_pool(force_secret_refresh: bool = False) -> None:
    global _pool
    if _pool is not None:
        return

    if not settings.PGHOST:
        raise RuntimeError("PGHOST is not set")

    s = get_db_secret(force_refresh=force_secret_refresh)
    user = s.get("username") or s.get("user")
    password = s.get("password")
    if not user or not password:
        raise RuntimeError("Secret missing required fields (username/password)")

    if settings.PGSSLMODE == "verify-full" and not settings.PGSSLROOTCERT:
        raise RuntimeError("PGSSLROOTCERT must be set when PGSSLMODE=verify-full")

    _pool = ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        host=settings.PGHOST,
        port=settings.PGPORT,
        dbname=settings.PGDATABASE,
        user=user,
        password=password,
        sslmode=settings.PGSSLMODE,
        sslrootcert=settings.PGSSLROOTCERT,
        connect_timeout=30,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=6,
    )


def _is_auth_error(e: Exception) -> bool:
    msg = str(e).lower()
    return (
        "password authentication failed" in msg
        or "authentication failed" in msg
        or "no pg_hba.conf entry" in msg
        or ("password" in msg and "failed" in msg)
    )


def with_conn(fn: Callable):
    global _pool, _cached_secret

    if _pool is None:
        init_pool()

    conn = _pool.getconn()
    try:
        conn.autocommit = False
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if settings.PG_STATEMENT_TIMEOUT_MS and settings.PG_STATEMENT_TIMEOUT_MS > 0:
                cur.execute("SET LOCAL statement_timeout = %s;", (str(settings.PG_STATEMENT_TIMEOUT_MS),))
            result = fn(conn, cur)
            conn.commit()
            return result

    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass

        if _is_auth_error(e):
            try:
                close_pool()
                _cached_secret = None
                init_pool(force_secret_refresh=True)

                conn2 = _pool.getconn()
                try:
                    conn2.autocommit = False
                    with conn2.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur2:
                        if settings.PG_STATEMENT_TIMEOUT_MS and settings.PG_STATEMENT_TIMEOUT_MS > 0:
                            cur2.execute("SET LOCAL statement_timeout = %s;", (str(settings.PG_STATEMENT_TIMEOUT_MS),))
                        result2 = fn(conn2, cur2)
                        conn2.commit()
                        return result2
                except Exception:
                    try:
                        conn2.rollback()
                    except Exception:
                        pass
                    raise
                finally:
                    _pool.putconn(conn2)
            except Exception:
                raise

        raise

    finally:
        try:
            _pool.putconn(conn)
        except Exception:
            pass

