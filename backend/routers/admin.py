
import logging
import os
import re
from collections import deque
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from dependencies import require_superadmin
from logging_config import LOG_DIR

router = APIRouter(prefix="/admin", tags=["admin"])

log = logging.getLogger("oikos")

_LOG_FILES = {
    "app":   "app.log",
    "auth":  "auth.log",
    "error": "error.log",
}

_LINE_RE = re.compile(
    r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"
    r"\s*\|\s*(?P<level>\w+)"
    r"\s*\|\s*(?P<logger>[\w.]+)"
    r"\s*\|\s*(?P<message>.+)$"
)


def _parse_line(raw: str) -> dict:
    m = _LINE_RE.match(raw.strip())
    if m:
        return {
            "timestamp": m.group("timestamp"),
            "level":     m.group("level"),
            "logger":    m.group("logger"),
            "message":   m.group("message"),
        }
    return {"timestamp": None, "level": None, "logger": None, "message": raw.strip()}


def _tail(filename: str, n: int = 30) -> list[dict]:
    path = os.path.join(LOG_DIR, filename)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        last_n = deque(f, maxlen=n)
    # deque gives oldest→newest; we want newest first
    return [_parse_line(line) for line in reversed(last_n)]


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/logs/app")
def get_app_logs(_: dict = Depends(require_superadmin)):
    try:
        return {"file": "app", "lines": _tail(_LOG_FILES["app"])}
    except Exception:
        log.exception("ADMIN get_app_logs failed")
        raise HTTPException(status_code=500, detail="Could not read log file")


@router.get("/logs/auth")
def get_auth_logs(_: dict = Depends(require_superadmin)):
    try:
        return {"file": "auth", "lines": _tail(_LOG_FILES["auth"])}
    except Exception:
        log.exception("ADMIN get_auth_logs failed")
        raise HTTPException(status_code=500, detail="Could not read log file")


@router.get("/logs/error")
def get_error_logs(_: dict = Depends(require_superadmin)):
    try:
        return {"file": "error", "lines": _tail(_LOG_FILES["error"])}
    except Exception:
        log.exception("ADMIN get_error_logs failed")
        raise HTTPException(status_code=500, detail="Could not read log file")
