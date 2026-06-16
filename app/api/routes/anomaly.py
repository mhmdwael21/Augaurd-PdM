"""Dashboard API routes — live replay snapshot, replay controls, CSV upload."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from app.schemas.anomaly_schema import ReplayControl
from app.services import replay_service
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# GET stays open (read-only snapshot, no side effects, not blocked by inference).
@router.get("", summary="Latest dashboard snapshot")
def get_dashboard() -> dict:
    """Return the most recent inference snapshot + replay state."""
    return replay_service.get_snapshot()


# Controls require a logged-in user (they mutate replay state).
@router.post("/replay", summary="Control the replay (play/pause/speed/scenario/reset)")
def control_replay(body: ReplayControl, _user=Depends(get_current_user)) -> dict:
    """Apply replay controls and return the new replay state."""
    return replay_service.control(
        playing=body.playing, speed=body.speed,
        scenario=body.scenario, reset=body.reset,
    )


# Sync handler: FastAPI runs it in a threadpool; read the upload synchronously.
@router.post("/upload", summary="Score an uploaded CSV slice")
def upload_csv(file: UploadFile = File(...), _user=Depends(get_current_user)) -> dict:
    """Run an uploaded MetroPT-3 CSV slice through the same pipeline; return results."""
    content = file.file.read()
    try:
        return replay_service.run_csv(content)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
