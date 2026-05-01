
import os


class Settings:
    APP_NAME = "oikos-api"
    AWS_REGION = os.getenv("AWS_REGION", "eu-north-1")
    SECRET_ID = os.getenv("OIKOS_DB_SECRET_ID")

    PGHOST = os.getenv("PGHOST")
    PGPORT = int(os.getenv("PGPORT", "5432"))
    PGDATABASE = os.getenv("PGDATABASE", "postgres")
    PGSSLMODE = os.getenv("PGSSLMODE", "verify-full")
    PGSSLROOTCERT = os.getenv("PGSSLROOTCERT", "/etc/pki/rds/global-bundle.pem")

    CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "*")
    PG_STATEMENT_TIMEOUT_MS = int(os.getenv("PG_STATEMENT_TIMEOUT_MS", "0"))

    # JWT
    JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS = 30

    # Email (Resend)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM_ADDRESS: str = os.getenv("EMAIL_FROM_ADDRESS", "Oikos <noreply@yourdomain.ch>")

    # Frontend
    FRONTEND_BASE_URL: str = os.getenv("FRONTEND_BASE_URL", "https://yourdomain.ch").rstrip("/")

    # Invitation token lifetime (days)
    INVITATION_TOKEN_EXPIRE_DAYS: int = int(os.getenv("INVITATION_TOKEN_EXPIRE_DAYS", "7"))

    # Crawler
    CRAWLER_API_KEY: str = os.getenv("CRAWLER_API_KEY", "")

    # GeoJSON
    GJ_PRECISION = 5
    SIMPLIFY_CANTONS_M = 200.0
    SIMPLIFY_CANTON_M = 120.0
    SIMPLIFY_GEMEINDEN_M = 25.0
    SIMPLIFY_GEMEINDE_M = 10.0
    ROOF_SIMPLIFY_M = 0.5


settings = Settings()
