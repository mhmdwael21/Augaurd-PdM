"""Authentication business logic."""

from typing import List
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user_schema import UserCreate
from app.utils.security import hash_password, verify_password

# Seeded system account (decision_service actor) — must never be deactivated.
SYSTEM_USERNAME = "auguard-ai"


def register_user(db: Session, payload: UserCreate) -> User:
    """Create a new user after validating uniqueness.

    Args:
        db: Active database session.
        payload: Registration data.

    Returns:
        The newly created ``User`` instance.

    Raises:
        HTTPException 400: If username or email is already taken.
    """
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, username: str, password: str) -> User:
    """Verify credentials and return the matching user.

    Args:
        db: Active database session.
        username: Submitted username.
        password: Submitted plain-text password.

    Returns:
        The authenticated ``User`` instance.

    Raises:
        HTTPException 401: If the username does not exist or the
            password is incorrect.
    """
    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact an administrator.",
        )

    return user


def list_all_users(db: Session) -> List[User]:
    """Return all registered users, newest first (admin view)."""
    return db.query(User).order_by(User.created_at.desc()).all()


def set_user_active(db: Session, user_id: UUID, is_active: bool, acting_user: User) -> User:
    """Activate or deactivate a user account (admin action).

    Guards: an admin cannot change their own status (self-lockout), and the
    seeded system account can never be deactivated (the ML pipeline writes as it).

    Raises:
        HTTPException 404: If the target user does not exist.
        HTTPException 400: On a self-change or a system-account change.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.id == acting_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own account status",
        )
    if user.username == SYSTEM_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The system account cannot be deactivated",
        )

    user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    """Change the caller's own password after verifying the current one.

    Raises:
        HTTPException 400: If the current password is incorrect.
    """
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.password_hash = hash_password(new_password)
    db.commit()
