
from fastapi import APIRouter
from config import settings

router = APIRouter(tags=["health"])

@router.get("/health")
def health():
    return {
        "ok": True,
        "statement_timeout_ms": settings.PG_STATEMENT_TIMEOUT_MS,
        "sslmode": settings.PGSSLMODE,
    }

