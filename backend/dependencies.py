
import logging
import secrets

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader, OAuth2PasswordBearer
from jose import JWTError, jwt

from config import settings
from database import with_conn

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_log = logging.getLogger("oikos.auth")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Decodes the JWT access token and returns the user payload.
    Raises 401 if the token is missing, expired, or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            _log.warning("UNAUTHORIZED JWT missing 'sub' claim")
            raise credentials_exception
    except JWTError as exc:
        _log.warning("UNAUTHORIZED invalid JWT: %s", type(exc).__name__)
        raise credentials_exception

    # Fetch user from DB to confirm they're still active
    def run(_conn, cur):
        cur.execute(
            "SELECT id, email, role, canton_code, is_active FROM auth.users WHERE id = %s LIMIT 1;",
            (int(user_id),),
        )
        return cur.fetchone()

    user = with_conn(run)

    if not user:
        _log.warning("UNAUTHORIZED user_id=%s not found in DB", user_id)
        raise credentials_exception
    if not user["is_active"]:
        _log.warning("UNAUTHORIZED user_id=%s account inactive", user_id)
        raise HTTPException(status_code=403, detail="Account is inactive")

    return user


def require_canton_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Only allows canton_admin or superadmin roles."""
    if current_user["role"] not in ("canton_admin", "superadmin"):
        _log.warning("FORBIDDEN user_id=%s role=%s tried canton_admin endpoint", current_user["id"], current_user["role"])
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return current_user


def require_superadmin(current_user: dict = Depends(get_current_user)) -> dict:
    """Only allows the superadmin role (you)."""
    if current_user["role"] != "superadmin":
        _log.warning("FORBIDDEN user_id=%s role=%s tried superadmin endpoint", current_user["id"], current_user["role"])
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return current_user


_crawler_key_header = APIKeyHeader(name="X-Crawler-Key", auto_error=False)


def require_crawler_key(api_key: str = Security(_crawler_key_header)) -> None:
    """Validates the X-Crawler-Key header against CRAWLER_API_KEY env var."""
    configured = settings.CRAWLER_API_KEY
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="Crawler access not configured on this server",
        )
    if not api_key or not secrets.compare_digest(api_key, configured):
        _log.warning("UNAUTHORIZED invalid or missing X-Crawler-Key")
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing X-Crawler-Key header",
        )
