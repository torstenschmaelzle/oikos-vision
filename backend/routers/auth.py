
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response, Depends, status
from pydantic import BaseModel, EmailStr, field_validator

from config import settings
from database import with_conn
from dependencies import get_current_user, require_canton_admin, require_superadmin
from services import auth_service
from services.email_service import EmailDeliveryError, send_invitation_email

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"

log = logging.getLogger("oikos.auth")


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SetupAccountRequest(BaseModel):
    token: str
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class InviteUserRequest(BaseModel):
    email: EmailStr
    role: str = "canton_viewer"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v not in ("canton_viewer", "canton_admin"):
            raise ValueError("Role must be canton_viewer or canton_admin")
        return v


class CreateCantonAdminRequest(BaseModel):
    email: EmailStr
    canton_code: str


# ─── Cookie helpers ───────────────────────────────────────────────────────────

def _set_refresh_cookie(response: Response, raw_token: str) -> None:
    from config import settings
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw_token,
        httponly=True,
        secure=True,
        samesite="None",
        max_age=60 * 60 * 24 * settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, httponly=True, secure=True, samesite="None")


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response):
    ip = request.client.host if request.client else "-"
    log.info("LOGIN attempt email=%s pw_len=%d ip=%s", body.email, len(body.password), ip)

    def run(_conn, cur):
        user = auth_service.authenticate_user(cur, body.email, body.password)
        access_token = auth_service.create_access_token(user["id"], user["role"], user["canton_code"])
        raw_refresh, refresh_hash = auth_service.generate_refresh_token()
        auth_service.store_refresh_token(cur, user["id"], refresh_hash, ip)
        cur.execute(
            "INSERT INTO auth.audit_log (user_id, action, ip_address) VALUES (%s, 'login', %s);",
            (user["id"], ip),
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"id": user["id"], "email": user["email"], "role": user["role"], "canton_code": user["canton_code"]},
            "_raw_refresh": raw_refresh,
        }

    try:
        result = with_conn(run)
        raw_refresh = result.pop("_raw_refresh")
        _set_refresh_cookie(response, raw_refresh)
        log.info("LOGIN success email=%s user_id=%s role=%s", body.email, result["user"]["id"], result["user"]["role"])
        return result
    except HTTPException as exc:
        log.warning("LOGIN failed email=%s ip=%s status=%d reason=%s", body.email, ip, exc.status_code, exc.detail)
        raise
    except Exception:
        log.exception("LOGIN unexpected error email=%s ip=%s", body.email, ip)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/refresh")
def refresh_token(request: Request, response: Response):
    ip = request.client.host if request.client else "-"
    raw_token = request.cookies.get(REFRESH_COOKIE)
    if not raw_token:
        log.warning("REFRESH no cookie present ip=%s", ip)
        raise HTTPException(status_code=401, detail="No refresh token")

    log.info("REFRESH attempt token_present=True ip=%s", ip)

    def run(_conn, cur):
        record = auth_service.validate_refresh_token(cur, raw_token)
        if not record:
            log.warning("REFRESH invalid token ip=%s", ip)
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        if record["revoked_at"]:
            log.warning("REFRESH revoked token user_id=%s ip=%s", record["user_id"], ip)
            raise HTTPException(status_code=401, detail="Refresh token revoked")
        if record["expires_at"] < datetime.now(timezone.utc):
            log.warning("REFRESH expired token user_id=%s ip=%s", record["user_id"], ip)
            raise HTTPException(status_code=401, detail="Refresh token expired")
        if not record["is_active"]:
            log.warning("REFRESH inactive account user_id=%s ip=%s", record["user_id"], ip)
            raise HTTPException(status_code=403, detail="Account inactive")

        auth_service.revoke_refresh_token(cur, raw_token)
        new_access = auth_service.create_access_token(record["user_id"], record["role"], record["canton_code"])
        new_raw, new_hash = auth_service.generate_refresh_token()
        auth_service.store_refresh_token(cur, record["user_id"], new_hash, ip)

        return {
            "access_token": new_access,
            "token_type": "bearer",
            "user": {"id": record["user_id"], "email": record["email"], "role": record["role"], "canton_code": record["canton_code"]},
            "_raw_refresh": new_raw,
        }

    try:
        result = with_conn(run)
        new_raw = result.pop("_raw_refresh")
        _set_refresh_cookie(response, new_raw)
        log.info("REFRESH success user_id=%s email=%s role=%s ip=%s", result["user"]["id"], result["user"]["email"], result["user"]["role"], ip)
        return result
    except HTTPException:
        raise
    except Exception:
        log.exception("REFRESH unexpected error ip=%s", ip)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/logout")
def logout(request: Request, response: Response):
    ip = request.client.host if request.client else "-"
    raw_token = request.cookies.get(REFRESH_COOKIE)
    log.info("LOGOUT started token_present=%s ip=%s", bool(raw_token), ip)
    if raw_token:
        def run(_conn, cur):
            auth_service.revoke_refresh_token(cur, raw_token)
        try:
            with_conn(run)
        except Exception:
            log.warning("LOGOUT failed to revoke token in DB ip=%s", ip, exc_info=True)
    _clear_refresh_cookie(response)
    log.info("LOGOUT success ip=%s", ip)
    return {"ok": True}


@router.post("/setup-account")
def setup_account(body: SetupAccountRequest, response: Response, request: Request):
    ip = request.client.host if request.client else "-"
    log.info("SETUP_ACCOUNT started token_prefix=%s... ip=%s", body.token[:8], ip)

    def run(_conn, cur):
        record = auth_service.validate_invitation_token(cur, body.token)
        if not record:
            log.warning("SETUP_ACCOUNT invalid/expired token ip=%s", ip)
            raise HTTPException(status_code=400, detail="Invalid or expired invitation link")
        if record["used_at"]:
            log.warning("SETUP_ACCOUNT already used token user_id=%s ip=%s", record["user_id"], ip)
            raise HTTPException(status_code=400, detail="This invitation link has already been used")
        if record["expires_at"] < datetime.now(timezone.utc):
            log.warning("SETUP_ACCOUNT expired token user_id=%s ip=%s", record["user_id"], ip)
            raise HTTPException(status_code=400, detail="Invitation link has expired. Ask your admin to resend.")

        auth_service.complete_account_setup(cur, record["user_id"], body.password, record["id"])
        access_token = auth_service.create_access_token(record["user_id"], record["role"], record["canton_code"])
        raw_refresh, refresh_hash = auth_service.generate_refresh_token()
        auth_service.store_refresh_token(cur, record["user_id"], refresh_hash, ip)

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {"id": record["user_id"], "email": record["email"], "role": record["role"], "canton_code": record["canton_code"]},
            "_raw_refresh": raw_refresh,
        }

    try:
        result = with_conn(run)
        raw_refresh = result.pop("_raw_refresh")
        _set_refresh_cookie(response, raw_refresh)
        log.info("SETUP_ACCOUNT success user_id=%s email=%s ip=%s", result["user"]["id"], result["user"]["email"], ip)
        return result
    except HTTPException:
        raise
    except Exception:
        log.exception("SETUP_ACCOUNT unexpected error ip=%s", ip)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"id": current_user["id"], "email": current_user["email"], "role": current_user["role"], "canton_code": current_user["canton_code"]}


@router.post("/invite-user")
def invite_user(body: InviteUserRequest, request: Request, current_user: dict = Depends(require_canton_admin)):
    canton_code = current_user["canton_code"]
    if not canton_code:
        raise HTTPException(status_code=400, detail="Superadmin must use /create-canton-admin endpoint")

    def run(_conn, cur):
        existing = auth_service.get_user_by_email(cur, body.email)
        if existing:
            log.warning("INVITE_USER email already exists email=%s by user_id=%s", body.email, current_user["id"])
            raise HTTPException(status_code=409, detail="A user with this email already exists")
        new_user_id = auth_service.create_invited_user(cur, body.email, canton_code, body.role, current_user["id"])
        raw_token, token_hash = auth_service.generate_invitation_token()
        auth_service.store_invitation_token(cur, new_user_id, token_hash)
        return raw_token

    try:
        raw_token = with_conn(run)
        setup_url = f"{settings.FRONTEND_BASE_URL}/setup-account?token={raw_token}"
        send_invitation_email(
            to_email=body.email,
            setup_url=setup_url,
            role=body.role,
            canton_code=canton_code,
        )
        log.info("INVITE_USER success email=%s role=%s canton=%s by user_id=%s",
                 body.email, body.role, canton_code, current_user["id"])
        return {"ok": True, "message": f"Invitation sent to {body.email}"}
    except HTTPException:
        raise
    except EmailDeliveryError:
        log.error(
            "INVITE_USER email delivery failed — user created but not notified "
            "email=%s role=%s canton=%s by user_id=%s",
            body.email, body.role, canton_code, current_user["id"],
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "User account was created but the invitation email could not be sent. "
                "Please contact your administrator to resend the invitation."
            ),
        )
    except Exception:
        log.exception("INVITE_USER unexpected error email=%s by user_id=%s", body.email, current_user["id"])
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/create-canton-admin")
def create_canton_admin(body: CreateCantonAdminRequest, current_user: dict = Depends(require_superadmin)):
    def run(_conn, cur):
        existing = auth_service.get_user_by_email(cur, body.email)
        if existing:
            log.warning("CREATE_CANTON_ADMIN email already exists email=%s", body.email)
            raise HTTPException(status_code=409, detail="A user with this email already exists")
        cur.execute("SELECT id FROM oikos.cantons WHERE canton_code = %s LIMIT 1;", (body.canton_code,))
        if not cur.fetchone():
            log.warning("CREATE_CANTON_ADMIN invalid canton_code=%s", body.canton_code)
            raise HTTPException(status_code=404, detail=f"Canton code '{body.canton_code}' not found")
        new_user_id = auth_service.create_invited_user(cur, body.email, body.canton_code, "canton_admin", current_user["id"])
        raw_token, token_hash = auth_service.generate_invitation_token()
        auth_service.store_invitation_token(cur, new_user_id, token_hash)
        return raw_token

    try:
        raw_token = with_conn(run)
        setup_url = f"{settings.FRONTEND_BASE_URL}/setup-account?token={raw_token}"
        send_invitation_email(
            to_email=body.email,
            setup_url=setup_url,
            role="canton_admin",
            canton_code=body.canton_code,
        )
        log.info("CREATE_CANTON_ADMIN success email=%s canton=%s by user_id=%s",
                 body.email, body.canton_code, current_user["id"])
        return {"ok": True, "message": f"Canton admin invitation sent to {body.email}"}
    except HTTPException:
        raise
    except EmailDeliveryError:
        log.error(
            "CREATE_CANTON_ADMIN email delivery failed — user created but not notified "
            "email=%s canton=%s by user_id=%s",
            body.email, body.canton_code, current_user["id"],
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "User account was created but the invitation email could not be sent. "
                "Please contact your administrator to resend the invitation."
            ),
        )
    except Exception:
        log.exception("CREATE_CANTON_ADMIN unexpected error email=%s", body.email)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/users/{user_id}")
def delete_user(user_id: int, current_user: dict = Depends(require_canton_admin)):
    def run(_conn, cur):
        cur.execute(
            "SELECT id, email, role, canton_code FROM auth.users WHERE id = %s LIMIT 1;",
            (user_id,),
        )
        target = cur.fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="User not found")

        # Nobody can delete themselves
        if target["id"] == current_user["id"]:
            raise HTTPException(status_code=400, detail="You cannot delete your own account")

        # Nobody can delete a superadmin
        if target["role"] == "superadmin":
            raise HTTPException(status_code=403, detail="Superadmin accounts cannot be deleted")

        # canton_admin: can only delete users in their own canton, and only canton_viewer
        if current_user["role"] == "canton_admin":
            if target["canton_code"] != current_user["canton_code"]:
                raise HTTPException(status_code=403, detail="You can only delete users in your own canton")
            if target["role"] != "canton_viewer":
                raise HTTPException(status_code=403, detail="Canton admins can only delete canton_viewer accounts")

        cur.execute("DELETE FROM auth.users WHERE id = %s;", (user_id,))
        cur.execute(
            "INSERT INTO auth.audit_log (user_id, action, detail) VALUES (%s, 'user_deleted', %s);",
            (current_user["id"], f'{{"deleted_user_id": {target["id"]}, "deleted_email": "{target["email"]}"}}'),
        )
        return target

    try:
        target = with_conn(run)
        log.info("DELETE_USER success deleted_user_id=%s email=%s by user_id=%s",
                 target["id"], target["email"], current_user["id"])
        return {"ok": True, "message": f"User {target['email']} deleted"}
    except HTTPException:
        raise
    except Exception:
        log.exception("DELETE_USER unexpected error user_id=%s by user_id=%s", user_id, current_user["id"])
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/users")
def list_users(current_user: dict = Depends(require_canton_admin)):
    def run(_conn, cur):
        if current_user["role"] == "superadmin":
            cur.execute("SELECT id, email, role, canton_code, is_active, created_at, last_login_at FROM auth.users ORDER BY canton_code, email;")
        else:
            cur.execute("SELECT id, email, role, canton_code, is_active, created_at, last_login_at FROM auth.users WHERE canton_code = %s ORDER BY email;", (current_user["canton_code"],))
        return cur.fetchall()

    try:
        return with_conn(run)
    except Exception:
        log.exception("LIST_USERS error user_id=%s", current_user["id"])
        raise HTTPException(status_code=500, detail="Internal server error")
