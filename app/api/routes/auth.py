"""Authentication API routes — register, login, and user listing."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.schemas.user_schema import (
    PasswordChange,
    TokenResponse,
    UserActiveUpdate,
    UserCreate,
    UserLogin,
    UserResponse,
)
from app.services.auth_service import (
    authenticate_user,
    change_password,
    list_all_users,
    register_user,
    set_user_active,
)
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


# ── GET /me ── Current user's own profile ────────────────────────────

@router.get("/me", response_model=UserResponse, summary="Get my profile")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's own account details."""
    return current_user


# ── PUT /me/password ── Change my own password ───────────────────────

@router.put("/me/password", summary="Change my password")
async def update_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the caller's own password (requires the current password)."""
    change_password(db, current_user, payload.current_password, payload.new_password)
    return {"message": "Password updated"}


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


# ── PUT /users/{id}/active ── Activate / deactivate (admin) ──────────

@router.put(
    "/users/{user_id}/active",
    response_model=UserResponse,
    summary="Activate or deactivate a user",
)
async def set_active(
    user_id: UUID,
    payload: UserActiveUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Activate or deactivate a user account (admin only).

    A deactivated user cannot log in and their existing token stops working.
    You cannot change your own status, nor the system account's.
    """
    return set_user_active(db, user_id, payload.is_active, current_user)

