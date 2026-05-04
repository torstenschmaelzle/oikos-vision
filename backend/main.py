
# trigger deploy
import logging
import time
import uuid

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from database import init_pool
from logging_config import setup_logging
from routers import health, cantons, gemeinden, roofs, auth, admin, tests, crawler

setup_logging()

_app_log = logging.getLogger("oikos")
_req_log = logging.getLogger("oikos.request")

app = FastAPI(title=settings.APP_NAME, root_path="/prod")


# ─── Request logging middleware ───────────────────────────────────────────────

class _RequestLogger(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = uuid.uuid4().hex[:8]
        start = time.perf_counter()
        method = request.method
        path = request.url.path
        client_ip = request.client.host if request.client else "-"
        fwd = request.headers.get("X-Forwarded-For", "")
        real_ip = request.headers.get("X-Real-IP", "")

        try:
            response = await call_next(request)
        except Exception:
            ms = (time.perf_counter() - start) * 1000
            _req_log.error(
                "req_id=%s %s %s UNHANDLED_EXCEPTION %.1fms ip=%s",
                req_id, method, path, ms, client_ip,
                exc_info=True,
            )
            raise

        ms = (time.perf_counter() - start) * 1000
        status = response.status_code
        extra = (f" fwd={fwd}" if fwd else "") + (f" real_ip={real_ip}" if real_ip else "")
        level = logging.WARNING if status >= 400 else logging.INFO
        _req_log.log(
            level,
            "req_id=%s %s %s %d %.1fms ip=%s%s",
            req_id, method, path, status, ms, client_ip, extra,
        )
        return response


app.add_middleware(_RequestLogger)


# ─── Security headers ─────────────────────────────────────────────────────────

class _SecurityHeaders(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Tell browsers to always use HTTPS for this host for 1 year.
        # Safe because TLS terminates at the ALB before reaching this host.
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(_SecurityHeaders)


# ─── CORS ────────────────────────────────────────────────────────────────────

_raw_origins = settings.CORS_ALLOW_ORIGINS.strip()

if _raw_origins == "*":
    # Open API: allow any origin while keeping credentials (cookies/JWT) working.
    # The CORS spec forbids "Access-Control-Allow-Origin: *" with credentials, so
    # we echo the request Origin back instead — every caller is allowed but the
    # browser still enforces same-origin rules for everything else.
    _app_log.info("CORS configured with open origin-echo mode (all origins allowed with credentials)")

    class _OpenCORSMiddleware(BaseHTTPMiddleware):
        _ALLOW_METHODS = "GET, POST, DELETE, OPTIONS"
        _ALLOW_HEADERS = "Authorization, Content-Type"

        async def dispatch(self, request: Request, call_next) -> Response:
            origin = request.headers.get("origin", "")
            if request.method == "OPTIONS":
                # Preflight — respond immediately without hitting the router
                resp = Response(status_code=200)
                if origin:
                    resp.headers["Access-Control-Allow-Origin"] = origin
                    resp.headers["Access-Control-Allow-Credentials"] = "true"
                    resp.headers["Access-Control-Allow-Methods"] = self._ALLOW_METHODS
                    resp.headers["Access-Control-Allow-Headers"] = self._ALLOW_HEADERS
                    resp.headers["Access-Control-Max-Age"] = "600"
                    resp.headers["Vary"] = "Origin"
                return resp
            resp = await call_next(request)
            if origin:
                resp.headers["Access-Control-Allow-Origin"] = origin
                resp.headers["Access-Control-Allow-Credentials"] = "true"
                resp.headers["Vary"] = "Origin"
            return resp

    app.add_middleware(_OpenCORSMiddleware)

else:
    # Explicit origin list — standard CORSMiddleware
    allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )


# ─── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    # Hard-fail if the insecure default JWT secret is still in use.
    if settings.JWT_SECRET in ("change-me-in-production", "", "secret"):
        raise RuntimeError(
            "JWT_SECRET is set to an insecure default value. "
            "Set a strong random secret in /etc/oikos-api.env before starting."
        )
    _app_log.info("Starting %s — CORS origins: %s", settings.APP_NAME, settings.CORS_ALLOW_ORIGINS)
    init_pool()
    _app_log.info("Database pool initialized")
    from services.test_runner import ensure_schema
    ensure_schema()


# ─── Routers ─────────────────────────────────────────────────────────────────

app.include_router(health.router,    prefix="/api")
app.include_router(cantons.router,   prefix="/api")
app.include_router(gemeinden.router, prefix="/api")
app.include_router(roofs.router,     prefix="/api")
app.include_router(auth.router,      prefix="/api")
app.include_router(admin.router,     prefix="/api")
app.include_router(tests.router,     prefix="/api")
app.include_router(crawler.router,   prefix="/api")


# ─── Legacy health compat ────────────────────────────────────────────────────

@app.get("/health")
def health_compat():
    return {"ok": True}
