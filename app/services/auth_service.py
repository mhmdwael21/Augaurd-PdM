"""Authentication business logic."""

from typing import List

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.user_schema import UserCreate
from app.utils.security import hash_password, verify_password


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

    return user


def list_all_users(db: Session) -> List[User]:
    """Return all registered users, newest first (admin view)."""
    return db.query(User).order_by(User.created_at.desc()).all()
