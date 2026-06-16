"""Password hashing utilities using bcrypt directly.

Uses the maintained `bcrypt` library straight, instead of the older
passlib wrapper (which is unmaintained and breaks with bcrypt 5.x).
"""

import bcrypt

# bcrypt only accepts up to 72 bytes of password material; longer inputs
# are truncated to that limit before hashing/verifying.
_MAX_BYTES = 72


def hash_password(plain_password: str) -> str:
    """Return a bcrypt hash of the given plain-text password."""
    pw_bytes = plain_password.encode("utf-8")[:_MAX_BYTES]
    hashed = bcrypt.hashpw(pw_bytes, bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return ``True`` if *plain_password* matches *hashed_password*."""
    pw_bytes = plain_password.encode("utf-8")[:_MAX_BYTES]
    return bcrypt.checkpw(pw_bytes, hashed_password.encode("utf-8"))
