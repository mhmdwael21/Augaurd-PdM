"""Pydantic schemas for authentication and user management."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


# ── Request Schemas ──────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Body for POST /auth/register."""

    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: EmailStr = Field(..., description="Unique email address")
    password: str = Field(..., min_length=6, description="Plain-text password (will be hashed)")
    role: Optional[UserRole] = Field(UserRole.OPERATOR, description="User role (defaults to operator)")


class UserLogin(BaseModel):
    """Body for POST /auth/login."""

    username: str = Field(..., description="Registered username")
    password: str = Field(..., description="Plain-text password")


# ── Response Schemas ─────────────────────────────────────────────────

class TokenResponse(BaseModel):
    """JWT token returned after successful login."""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")


class UserResponse(BaseModel):
    """Safe user representation (no password hash)."""

    id: UUID
    username: str
    email: str
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True
