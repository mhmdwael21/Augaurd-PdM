"""FastAPI dependencies for authentication and authorization."""

from typing import List

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.utils.jwt_handler import decode_access_token

_security_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate the JWT, then return the corresponding user.

    Raises:
        HTTPException 401: If the token is missing, invalid, expired, or
            the user no longer exists.
    """
    payload = decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    username: str | None = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload invalid",
        )

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def require_role(*allowed_roles: UserRole):
    """Return a dependency that restricts access to specific roles.

    Usage::

        @router.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
        async def admin_endpoint(): ...

    Raises:
        HTTPException 403: If the current user's role is not in
            *allowed_roles*.
    """

    def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _role_checker
