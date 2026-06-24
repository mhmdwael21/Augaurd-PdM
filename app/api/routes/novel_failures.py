"""Novel Failure Capture API routes.

Reads open to any authenticated user (list + dashboard card); the status write is
admin-only. Capture itself happens in decision_service (not here) — these routes
only surface and triage what was captured.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.novel_failure_schema import (
    NovelFailureCandidateResponse,
    NovelFailureStatusUpdate,
)
from app.services.novel_failure_service import (
    get_latest_candidate,
    list_candidates,
    update_status,
)
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(prefix="/novel-failures", tags=["Novel Failures"])


@router.get("/", response_model=List[NovelFailureCandidateResponse], summary="List novel failure candidates")
async def list_all(
    status: Optional[str] = Query(None, description="Filter by status (new|under_review|confirmed|dismissed)"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_candidates(db, status=status, limit=limit)


@router.get("/latest", response_model=Optional[NovelFailureCandidateResponse], summary="Most recent novel failure (dashboard card)")
async def latest(
    scenario: Optional[str] = Query(None, description="Limit to a replay scenario (e.g. F4) — the dashboard card passes the active one"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_latest_candidate(db, scenario=scenario)


@router.put("/{candidate_id}/status", response_model=NovelFailureCandidateResponse, summary="Update triage status")
async def set_status(
    candidate_id: UUID,
    payload: NovelFailureStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    try:
        row = update_status(db, candidate_id, payload.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if row is None:
        raise HTTPException(status_code=404, detail="Novel failure candidate not found")
    return row
