"""Authentication API routes — register, login, and user listing."""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.user_schema import (
    TokenResponse,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.auth_service import authenticate_user, list_all_users, register_user
from app.utils.jwt_handler import create_access_token
from app.utils.dependencies import get_current_user, require_role

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=201,
    summary="Register a new user",
)
async def register(payload: UserCreate, db: Session = Depends(get_db)):
    """Create a new user account.

    Returns:
        The created user (without password hash).
    """
    user = register_user(db, payload)
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and obtain a JWT",
)
async def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Validate credentials and return a JWT access token.

    Raises:
        HTTPException 401: If the credentials are invalid.
    """
    user = authenticate_user(db, payload.username, payload.password)
    token = create_access_token(data={"sub": user.username, "role": user.role.value})
    return TokenResponse(access_token=token)


# ── GET /users ── List all users (admin) ─────────────────────────────

@router.get(
    "/users",
    response_model=List[UserResponse],
    summary="List all users",
)
async def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Return all registered users (admin only)."""
    return list_all_users(db)

