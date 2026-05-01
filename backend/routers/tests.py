"""
Superadmin-only endpoints for triggering and inspecting test suite runs.

All endpoints require the superadmin role. The frontend should use the
run_id (UUID) returned by POST /runs to poll for status.
"""
import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Query

from dependencies import require_superadmin
from services import test_runner as tr

router = APIRouter(prefix="/admin/tests", tags=["tests"])
_log = logging.getLogger("oikos")


@router.post("/runs", status_code=202)
def trigger_run(current_user: dict = Depends(require_superadmin)):
    """
    Trigger a new full-suite pytest run.

    Returns immediately (HTTP 202) with a run_id for polling.
    Returns HTTP 409 if a run is already in progress.
    """
    with tr._run_lock:
        if tr._state["active_run_id"] is not None:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "run_in_progress",
                    "message": "A test run is already in progress",
                    "active_run_id": tr._state["active_run_id"],
                },
            )
        run = tr.create_run(triggered_by=current_user["id"])
        run_uuid = run["run_id"]
        tr._state["active_run_id"] = run_uuid

    thread = threading.Thread(
        target=tr.launch_test_run,
        args=(run_uuid,),
        daemon=True,
        name=f"test-{run_uuid[:8]}",
    )
    thread.start()

    _log.info(
        "test_run triggered: run_uuid=%s by=%s",
        run_uuid, current_user["email"],
    )
    return {
        "run_id":  run_uuid,
        "status":  "queued",
        "message": "Test run started",
    }


@router.get("/runs")
def list_runs(
    limit:  int = Query(20, ge=1, le=100),
    offset: int = Query(0,  ge=0),
    current_user: dict = Depends(require_superadmin),
):
    """List test runs, newest first. Supports pagination via limit/offset."""
    return {
        "runs":   tr.get_runs(limit=limit, offset=offset),
        "total":  tr.count_runs(),
        "limit":  limit,
        "offset": offset,
    }


@router.get("/runs/latest")
def latest_run(current_user: dict = Depends(require_superadmin)):
    """Return the most recent test run, or 404 if no runs exist yet."""
    run = tr.get_latest_run()
    if run is None:
        raise HTTPException(status_code=404, detail="No test runs found")
    return run


@router.get("/runs/{run_id}")
def get_run(run_id: str, current_user: dict = Depends(require_superadmin)):
    """Fetch a specific test run by UUID."""
    run = tr.get_run_by_uuid(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/runs/{run_id}/output")
def run_output(run_id: str, current_user: dict = Depends(require_superadmin)):
    """
    Return the raw pytest stdout for a completed run.

    Only available once the run has finished (output_available = true).
    """
    run = tr.get_run_by_uuid(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if not run["output_available"]:
        raise HTTPException(
            status_code=404,
            detail="Output not yet available — run may still be in progress",
        )
    text = tr.get_run_output(run_id)
    if text is None:
        raise HTTPException(
            status_code=500,
            detail="Output file missing from disk — was it deleted?",
        )
    return {"run_id": run_id, "status": run["status"], "output": text}
