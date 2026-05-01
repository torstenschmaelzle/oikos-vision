"""
Test runner service.

Manages background execution of pytest, artifact storage, and DB tracking.

Storage layout:
    test_artifacts/{run_uuid}/output.txt   — raw pytest stdout + stderr

DB table: auth.test_runs  (created automatically on first startup)
"""
import logging
import re
import subprocess
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from database import with_conn

_log = logging.getLogger("oikos")

# ─── Concurrency state ────────────────────────────────────────────────────────
# Using a dict (not a bare global) so the router module can read/write it
# without importing a bare name that only reflects the value at import time.
_state: dict = {"active_run_id": None}
_run_lock = threading.Lock()

# ─── Filesystem paths ─────────────────────────────────────────────────────────
_BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = _BASE_DIR / "test_artifacts"
TESTS_DIR = _BASE_DIR / "tests"
VENV_PYTHON = _BASE_DIR / "venv" / "bin" / "python"

# ─── Common SELECT fragment (reused by all run-fetch helpers) ─────────────────
_SELECT = """
    SELECT
        r.id,
        r.run_uuid::text          AS run_id,
        r.status,
        r.suite,
        r.started_at,
        r.finished_at,
        r.duration_s,
        r.total_tests,
        r.passed,
        r.failed,
        r.skipped,
        r.summary,
        r.error_message,
        r.failure_names,
        (r.output_path IS NOT NULL) AS output_available,
        r.created_at,
        u.email                   AS triggered_by_email
    FROM auth.test_runs r
    LEFT JOIN auth.users u ON u.id = r.triggered_by
"""


# ─── Schema bootstrap ─────────────────────────────────────────────────────────

def ensure_schema() -> None:
    """
    Create auth.test_runs if it doesn't exist, then recover any runs that were
    left in an incomplete state by a prior server crash or restart.
    Must be called from on_startup after init_pool().
    """
    def _run(conn, cur):
        cur.execute("""
            CREATE TABLE IF NOT EXISTS auth.test_runs (
                id              SERIAL PRIMARY KEY,
                run_uuid        UUID         NOT NULL,
                triggered_by    INT          REFERENCES auth.users(id) ON DELETE SET NULL,
                status          VARCHAR(20)  NOT NULL DEFAULT 'queued',
                suite           VARCHAR(100) NOT NULL DEFAULT 'all',
                started_at      TIMESTAMPTZ,
                finished_at     TIMESTAMPTZ,
                duration_s      DOUBLE PRECISION,
                total_tests     INT,
                passed          INT,
                failed          INT,
                skipped         INT,
                summary         TEXT,
                error_message   TEXT,
                output_path     TEXT,
                created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
            )
        """)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS test_runs_uuid_idx
            ON auth.test_runs (run_uuid)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS test_runs_created_idx
            ON auth.test_runs (created_at DESC)
        """)
        # Add failure_names column if the table already existed without it
        cur.execute("""
            ALTER TABLE auth.test_runs
            ADD COLUMN IF NOT EXISTS failure_names TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
        """)
        # Mark any runs orphaned by a prior crash as failed
        cur.execute("""
            UPDATE auth.test_runs
               SET status        = 'failed',
                   error_message = 'Server restarted before run completed',
                   finished_at   = NOW()
             WHERE status IN ('queued', 'running')
        """)

    with_conn(_run)
    ARTIFACTS_DIR.mkdir(exist_ok=True)
    _log.info("test_runs: schema ready, artifacts_dir=%s", ARTIFACTS_DIR)


# ─── Database helpers ─────────────────────────────────────────────────────────

def create_run(triggered_by: int, suite: str = "all") -> dict:
    """Insert a new queued run record. Returns the row as a dict (run_id = UUID text)."""
    run_uuid = str(uuid.uuid4())

    def _q(conn, cur):
        cur.execute(
            """
            INSERT INTO auth.test_runs (run_uuid, triggered_by, status, suite)
            VALUES (%s, %s, 'queued', %s)
            RETURNING id, run_uuid::text AS run_id, status, suite, created_at
            """,
            (run_uuid, triggered_by, suite),
        )
        return dict(cur.fetchone())

    return with_conn(_q)


# Explicit allowlist prevents dynamic column name injection if the call sites
# were ever changed to accept external input.
_ALLOWED_RUN_COLUMNS: frozenset[str] = frozenset({
    "status", "started_at", "finished_at", "duration_s",
    "total_tests", "passed", "failed", "skipped",
    "summary", "error_message", "output_path", "failure_names",
})


def _set_fields(run_uuid: str, **fields) -> None:
    """Update specific columns on a test_run row identified by UUID."""
    if not fields:
        return
    unknown = set(fields) - _ALLOWED_RUN_COLUMNS
    if unknown:
        raise ValueError(f"_set_fields: disallowed column(s): {unknown}")
    set_sql = ", ".join(f"{col} = %s" for col in fields)
    vals = list(fields.values()) + [run_uuid]

    def _q(conn, cur):
        cur.execute(
            f"UPDATE auth.test_runs SET {set_sql} WHERE run_uuid = %s",
            vals,
        )

    with_conn(_q)


def get_run_by_uuid(run_uuid: str) -> Optional[dict]:
    def _q(conn, cur):
        cur.execute(_SELECT + " WHERE r.run_uuid = %s", (run_uuid,))
        row = cur.fetchone()
        return dict(row) if row else None

    return with_conn(_q)


def get_runs(limit: int = 20, offset: int = 0) -> list:
    def _q(conn, cur):
        cur.execute(
            _SELECT + " ORDER BY r.created_at DESC LIMIT %s OFFSET %s",
            (limit, offset),
        )
        return [dict(r) for r in cur.fetchall()]

    return with_conn(_q)


def get_latest_run() -> Optional[dict]:
    def _q(conn, cur):
        cur.execute(_SELECT + " ORDER BY r.created_at DESC LIMIT 1")
        row = cur.fetchone()
        return dict(row) if row else None

    return with_conn(_q)


def count_runs() -> int:
    """Return the total number of test runs (for pagination metadata)."""
    def _q(conn, cur):
        cur.execute("SELECT COUNT(*) AS n FROM auth.test_runs")
        return cur.fetchone()["n"]

    return with_conn(_q)


def get_run_output(run_uuid: str) -> Optional[str]:
    """Read the raw artifact file from disk. Returns None if unavailable."""
    def _q(conn, cur):
        cur.execute(
            "SELECT output_path FROM auth.test_runs WHERE run_uuid = %s",
            (run_uuid,),
        )
        row = cur.fetchone()
        return row["output_path"] if row else None

    path_str = with_conn(_q)
    if not path_str:
        return None
    try:
        # Resolve the stored path and confirm it lives inside ARTIFACTS_DIR.
        # Defence-in-depth: the path is written by us, but guard against
        # DB-level tampering that could redirect reads to arbitrary files.
        resolved = Path(path_str).resolve()
        resolved.relative_to(ARTIFACTS_DIR.resolve())  # raises ValueError if outside
    except ValueError:
        _log.error(
            "test_runner: output_path %r is outside ARTIFACTS_DIR %s — refusing to read",
            path_str, ARTIFACTS_DIR,
        )
        return None
    try:
        return resolved.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        _log.warning("test_runner: cannot read output file %s: %s", path_str, exc)
        return None


# ─── Output parsing ────────────────────────────────────────────────────────────

_TEST_LINE_RE = re.compile(
    r"^(?P<name>\S.*?)\s+(?P<status>PASSED|FAILED|ERROR|SKIPPED)\s*(?:\[.*\])?\s*$"
)
_SUMMARY_RE = re.compile(r"={3,}\s+(?P<body>.+?)\s+=+\s*$")
_DURATION_RE = re.compile(r"in (?P<sec>\d+\.?\d*)s")


def _parse_output(output: str) -> dict:
    """Parse pytest -v --tb=short output into structured fields."""
    passed = failed = skipped = 0
    failure_names: list[str] = []

    for line in output.splitlines():
        m = _TEST_LINE_RE.match(line)
        if not m:
            continue
        status = m.group("status")
        if status == "PASSED":
            passed += 1
        elif status in ("FAILED", "ERROR"):
            failed += 1
            failure_names.append(m.group("name"))
        elif status == "SKIPPED":
            skipped += 1

    # Find the last summary line  (=== N passed, M failed in X.Xs ===)
    summary = ""
    for line in reversed(output.splitlines()):
        m = _SUMMARY_RE.match(line)
        if m:
            body = m.group("body")
            if any(w in body for w in ("passed", "failed", "error", "warning", "no tests")):
                summary = body
                break

    # Fallback: parse counts from summary when per-line pass found nothing
    if passed == 0 and failed == 0 and skipped == 0 and summary:
        for pattern, bucket in [
            (r"(\d+) passed",  "p"),
            (r"(\d+) failed",  "f"),
            (r"(\d+) error",   "f"),
            (r"(\d+) skipped", "s"),
        ]:
            cm = re.search(pattern, summary)
            if cm:
                n = int(cm.group(1))
                if bucket == "p":   passed  += n
                elif bucket == "f": failed  += n
                elif bucket == "s": skipped += n

    duration_s = 0.0
    dm = _DURATION_RE.search(summary)
    if dm:
        duration_s = float(dm.group("sec"))

    return {
        "passed":       passed,
        "failed":       failed,
        "skipped":      skipped,
        "total_tests":  passed + failed + skipped,
        "summary":      summary or "no summary line found",
        "duration_s":   duration_s,
        "failure_names": failure_names,
    }


# ─── Background runner ─────────────────────────────────────────────────────────

def launch_test_run(run_uuid: str) -> None:
    """
    Runs in a daemon thread.
    Executes pytest, captures output to disk, parses results, updates DB.
    Releases _state["active_run_id"] in the finally block unconditionally.
    """
    artifact_dir = ARTIFACTS_DIR / run_uuid
    artifact_dir.mkdir(parents=True, exist_ok=True)
    output_file = artifact_dir / "output.txt"

    try:
        _set_fields(
            run_uuid,
            status="running",
            started_at=datetime.now(timezone.utc),
            output_path=str(output_file),
        )

        # ── Guard: no tests directory ────────────────────────────────────────
        if not TESTS_DIR.exists():
            msg = f"No tests/ directory found at {TESTS_DIR}"
            output_file.write_text(msg + "\n", encoding="utf-8")
            _set_fields(
                run_uuid,
                status="failed",
                finished_at=datetime.now(timezone.utc),
                duration_s=0.0,
                total_tests=0,
                passed=0,
                failed=0,
                skipped=0,
                summary="no tests directory",
                error_message=msg,
            )
            return

        # ── Execute pytest ───────────────────────────────────────────────────
        cmd = [
            str(VENV_PYTHON), "-m", "pytest",
            str(TESTS_DIR),
            "-v", "--tb=short", "--no-header",
        ]
        _log.info("test_runner: starting run=%s  cmd=%s", run_uuid[:8], " ".join(cmd))

        with open(output_file, "w", encoding="utf-8") as fh:
            result = subprocess.run(
                cmd,
                stdout=fh,
                stderr=subprocess.STDOUT,
                timeout=600,          # 10-minute hard limit
                cwd=str(_BASE_DIR),
            )

        raw = output_file.read_text(encoding="utf-8", errors="replace")
        parsed = _parse_output(raw)

        # pytest exit codes: 0=all passed  1=some failed  5=no tests collected
        if result.returncode == 5:
            run_status = "succeeded"
            parsed["summary"] = parsed["summary"] or "no tests collected"
        elif result.returncode in (0, 1):
            run_status = "succeeded" if parsed["failed"] == 0 else "failed"
        else:
            run_status = "failed"

        _set_fields(
            run_uuid,
            status=run_status,
            finished_at=datetime.now(timezone.utc),
            duration_s=parsed["duration_s"],
            total_tests=parsed["total_tests"],
            passed=parsed["passed"],
            failed=parsed["failed"],
            skipped=parsed["skipped"],
            summary=parsed["summary"],
            failure_names=parsed["failure_names"],
            error_message=(
                None
                if result.returncode in (0, 1, 5)
                else f"pytest exited with code {result.returncode}"
            ),
        )
        _log.info(
            "test_runner: run=%s  status=%s  %s",
            run_uuid[:8], run_status, parsed["summary"],
        )

    except subprocess.TimeoutExpired:
        _log.error("test_runner: run=%s TIMED OUT after 600s", run_uuid[:8])
        try:
            with open(output_file, "a", encoding="utf-8") as fh:
                fh.write("\n[KILLED: run exceeded 10-minute timeout]\n")
        except OSError:
            pass
        _set_fields(
            run_uuid,
            status="failed",
            finished_at=datetime.now(timezone.utc),
            error_message="Run exceeded 10-minute timeout",
        )

    except Exception:
        _log.exception("test_runner: unexpected error in run=%s", run_uuid[:8])
        _set_fields(
            run_uuid,
            status="failed",
            finished_at=datetime.now(timezone.utc),
            error_message="Internal runner error — check server logs",
        )

    finally:
        with _run_lock:
            _state["active_run_id"] = None
        _log.info("test_runner: lock released, run=%s done", run_uuid[:8])
