
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

from fastapi import HTTPException, status
from jose import jwt
from passlib.context import CryptContext

from config import settings

logger = logging.getLogger("oikos.auth")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _log_bcrypt_runtime_info() -> None:
    try:
        import bcrypt as py_bcrypt
        file_ = getattr(py_bcrypt, "__file__", None)
        about = getattr(py_bcrypt, "__about__", None)
        ver = getattr(about, "__version__", None) if about else None
        mod_ver = getattr(py_bcrypt, "__version__", None)
        logger.info("AUTH bcrypt runtime info file=%s __version__=%s __about__.__version__=%s", file_, mod_ver, ver)
    except Exception:
        logger.exception("AUTH bcrypt runtime info check failed")

# run once on import
_log_bcrypt_runtime_info()


def _bcrypt_72bytes(plain: str) -> str:
    # bcrypt limit: 72 BYTES, not characters
    return plain.encode("utf-8")[:72].decode("utf-8", errors="ignore")


def hash_password(plain: str) -> str:
    plain72 = _bcrypt_72bytes(plain)
    try:
        return pwd_context.hash(plain72)
    except Exception:
        logger.exception("AUTH hash_password failed (bcrypt/passlib problem) plain_len=%s plain72_len=%s", len(plain), len(plain72))
        raise


def verify_password(plain: str, hashed: str) -> bool:
    plain72 = _bcrypt_72bytes(plain)
    try:
        return pwd_context.verify(plain72, hashed)
    except Exception:
        logger.exception(
            "AUTH verify_password failed (bcrypt/passlib problem) plain_len=%s plain72_len=%s hash_prefix=%s",
            len(plain),
            len(plain72),
            (hashed[:7] if hashed else None),
        )
        raise


def create_access_token(user_id: int, role: str, canton_code: Optional[str]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "role": role, "canton_code": canton_code, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def generate_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def generate_invitation_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def get_user_by_email(cur, email: str) -> Optional[Dict[str, Any]]:
    cur.execute(
        "SELECT id, email, password_hash, canton_code, role, is_active, failed_login_attempts, locked_until "
        "FROM auth.users WHERE email = %s LIMIT 1;",
        (email,),
    )
    return cur.fetchone()


def authenticate_user(cur, email: str, password: str) -> Dict[str, Any]:
    INVALID = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    user = get_user_by_email(cur, email)
    if not user:
        logger.warning("AUTH user not found email=%s", email)
        try:
            pwd_context.dummy_verify()
        except Exception:
            logger.exception("AUTH dummy_verify failed (bcrypt/passlib problem)")
        raise INVALID

    if user["locked_until"] and user["locked_until"] > datetime.now(timezone.utc):
        logger.warning("AUTH account locked email=%s locked_until=%s", email, user["locked_until"])
        raise HTTPException(status_code=403, detail="Account temporarily locked. Try again later.")

    if not user["is_active"]:
        logger.warning("AUTH account not activated email=%s user_id=%s", email, user["id"])
        raise HTTPException(status_code=403, detail="Account not yet activated. Check your email.")

    try:
        ok = bool(user["password_hash"]) and verify_password(password, user["password_hash"])
    except Exception:
        # verify_password already logged root cause
        raise HTTPException(status_code=500, detail="Password verification backend error")

    if not ok:
        new_attempts = user["failed_login_attempts"] + 1
        if new_attempts >= 5:
            locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            cur.execute(
                "UPDATE auth.users SET failed_login_attempts = %s, locked_until = %s WHERE id = %s;",
                (new_attempts, locked_until, user["id"]),
            )
            logger.warning("AUTH wrong password — account locked email=%s user_id=%s attempts=%d", email, user["id"], new_attempts)
        else:
            cur.execute(
                "UPDATE auth.users SET failed_login_attempts = %s WHERE id = %s;",
                (new_attempts, user["id"]),
            )
            logger.warning("AUTH wrong password email=%s user_id=%s attempts=%d", email, user["id"], new_attempts)
        raise INVALID

    cur.execute(
        "UPDATE auth.users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = %s;",
        (user["id"],),
    )
    logger.info("AUTH password verified ok email=%s user_id=%s role=%s", email, user["id"], user["role"])
    return user


def store_refresh_token(cur, user_id: int, token_hash: str, ip_address: Optional[str]) -> None:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    cur.execute(
        "INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at, ip_address) VALUES (%s, %s, %s, %s);",
        (user_id, token_hash, expire, ip_address),
    )


def validate_refresh_token(cur, raw_token: str) -> Optional[Dict[str, Any]]:
    token_hash = hash_token(raw_token)
    cur.execute(
        """
        SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
               u.email, u.role, u.canton_code, u.is_active
        FROM auth.refresh_tokens rt
        JOIN auth.users u ON u.id = rt.user_id
        WHERE rt.token_hash = %s LIMIT 1;
        """,
        (token_hash,),
    )
    return cur.fetchone()


def revoke_refresh_token(cur, raw_token: str) -> None:
    token_hash = hash_token(raw_token)
    cur.execute(
        "UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = %s;",
        (token_hash,),
    )


def create_invited_user(cur, email: str, canton_code: str, role: str, invited_by: int) -> int:
    cur.execute(
        "INSERT INTO auth.users (email, canton_code, role, is_active) VALUES (%s, %s, %s, false) RETURNING id;",
        (email, canton_code, role),
    )
    row = cur.fetchone()
    cur.execute(
        "INSERT INTO auth.audit_log (user_id, action, detail) VALUES (%s, 'invite_sent', %s);",
        (invited_by, f'{{"invited_email": "{email}", "canton_code": "{canton_code}"}}'),
    )
    logger.info("AUTH user invited email=%s canton=%s role=%s by user_id=%s new_user_id=%s", email, canton_code, role, invited_by, row["id"])
    return row["id"]


def store_invitation_token(cur, user_id: int, token_hash: str) -> None:
    from config import settings
    # Invalidate any still-open token for this user before issuing a new one.
    cur.execute(
        "UPDATE auth.invitation_tokens SET used_at = now() WHERE user_id = %s AND used_at IS NULL;",
        (user_id,),
    )
    expire = datetime.now(timezone.utc) + timedelta(days=settings.INVITATION_TOKEN_EXPIRE_DAYS)
    cur.execute(
        "INSERT INTO auth.invitation_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, %s);",
        (user_id, token_hash, expire),
    )


def validate_invitation_token(cur, raw_token: str) -> Optional[Dict[str, Any]]:
    token_hash = hash_token(raw_token)
    cur.execute(
        """
        SELECT it.id, it.user_id, it.expires_at, it.used_at,
               u.email, u.canton_code, u.role
        FROM auth.invitation_tokens it
        JOIN auth.users u ON u.id = it.user_id
        WHERE it.token_hash = %s LIMIT 1;
        """,
        (token_hash,),
    )
    return cur.fetchone()


def complete_account_setup(cur, user_id: int, password: str, invitation_token_id: int) -> None:
    try:
        pw_hash = hash_password(password)
    except Exception:
        raise HTTPException(status_code=500, detail="Password hashing backend error")

    cur.execute(
        "UPDATE auth.users SET password_hash = %s, is_active = true WHERE id = %s;",
        (pw_hash, user_id),
    )
    cur.execute(
        "UPDATE auth.invitation_tokens SET used_at = now() WHERE id = %s;",
        (invitation_token_id,),
    )
    cur.execute(
        "INSERT INTO auth.audit_log (user_id, action, detail) VALUES (%s, 'account_activated', '{}');",
        (user_id,),
    )
    logger.info("AUTH account activated user_id=%s", user_id)
