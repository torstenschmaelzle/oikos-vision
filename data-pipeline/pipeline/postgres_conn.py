import os
import json
import boto3
import psycopg2
from Logger import log

VERIFY_MODES = {"verify-ca", "verify-full"}

class PostgresConn:
    def get_env_config(self):
        region_name = os.getenv("AWS_REGION")
        secret_id = os.getenv("OIKOS_DB_SECRET_ID")
        pghost = os.getenv("PGHOST")
        pgport = os.getenv("PGPORT", "5432")
        pgdatabase = os.getenv("PGDATABASE", "postgres")
        pgsslmode = os.getenv("PGSSLMODE", "require")
        pgsslrootcert = os.getenv("PGSSLROOTCERT")  # optional in require-mode

        missing = []
        if not region_name: missing.append("AWS_REGION")
        if not secret_id: missing.append("OIKOS_DB_SECRET_ID")
        if not pghost: missing.append("PGHOST")

        if missing:
            log.error("Config error: missing required env vars: %s", ", ".join(missing))
            raise RuntimeError(f"Missing env vars: {', '.join(missing)}")

        # only required when verifying
        if pgsslmode in VERIFY_MODES and not pgsslrootcert:
            log.error("Config error: PGSSLROOTCERT required for sslmode=%s", pgsslmode)
            raise RuntimeError(f"PGSSLROOTCERT required for sslmode={pgsslmode}")

        return region_name, secret_id, pghost, pgport, pgdatabase, pgsslmode, pgsslrootcert

    def retrieve_secret(self, region_name, secret_id):
        sm = boto3.client("secretsmanager", region_name=region_name)
        resp = sm.get_secret_value(SecretId=secret_id)
        secret_str = resp.get("SecretString")
        if not secret_str:
            raise RuntimeError("SecretString missing in Secrets Manager response")

        secret = json.loads(secret_str)
        user = secret.get("username") or secret.get("user")
        password = secret.get("password")

        if not user or not password:
            log.error("Secret missing username/password. keys=%s", list(secret.keys()))
            raise RuntimeError("secret is missing required fields (username/password)")

        return user, password

    def connect(self):
        pghost = pgdatabase = pgsslmode = pgsslrootcert = None
        try:
            region_name, secret_id, pghost, pgport, pgdatabase, pgsslmode, pgsslrootcert = self.get_env_config()
            user, password = self.retrieve_secret(region_name, secret_id)

            kwargs = dict(
                host=pghost,
                port=int(pgport),
                dbname=pgdatabase,
                user=user,
                password=password,
                sslmode=pgsslmode,
                connect_timeout=30,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=6,
            )

            # ONLY add sslrootcert when verifying
            if pgsslmode in VERIFY_MODES:
                kwargs["sslrootcert"] = pgsslrootcert

            conn = psycopg2.connect(**kwargs)

            log.info("Connected to Postgres host=%s db=%s user=%s sslmode=%s",
                     pghost, pgdatabase, user, pgsslmode)
            return conn

        except Exception as e:
            log.exception("Failed to connect to Postgres host=%s db=%s sslmode=%s EXCEPTION=%s",
                          pghost, pgdatabase, pgsslmode, e)
            raise