"""Admin Panel API routes — admin-only protected endpoint."""

from fastapi import APIRouter, Depends

from app.models.user import User, UserRole
from app.utils.dependencies import require_role

router = APIRouter(
    tags=["Admin Panel"],
)


@router.get(
    "/admin_panel",
    summary="Admin panel",
)
async def admin_panel(
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Return a welcome message for authenticated admins.

    Raises:
        HTTPException 401: If no valid token is provided.
        HTTPException 403: If the user is not an admin.
    """
    return {
        "message": f"Welcome to the admin panel, {current_user.username}!",
        "role": current_user.role.value,
    }
