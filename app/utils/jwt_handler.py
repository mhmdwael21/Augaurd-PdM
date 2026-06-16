"""JWT creation and decoding utilities."""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from jose import JWTError, jwt

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, SECRET_KEY


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        data: Claims to encode in the token (must include ``sub``).
        expires_delta: Custom expiry duration; defaults to
            ``ACCESS_TOKEN_EXPIRE_MINUTES`` from config.

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a JWT access token.

    Returns:
        The decoded payload dict, or ``None`` if the token is invalid or
        expired.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
