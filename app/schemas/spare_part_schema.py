"""Pydantic schemas for the spare_parts (MRO inventory) module."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Request Schemas ──────────────────────────────────────────────────

class SparePartCreate(BaseModel):
    """Body for POST /spare-parts (admin)."""

    part_name: str = Field(..., min_length=1, max_length=120)
    part_number: str = Field(..., min_length=1, max_length=60)
    quantity_in_stock: int = Field(0, ge=0)
    min_stock_level: int = Field(0, ge=0)
    location: Optional[str] = Field(None, max_length=80)
    unit_cost: Optional[float] = Field(None, ge=0)
    equipment_id: Optional[UUID] = Field(None, description="Compatible asset (null = generic)")


class SparePartUpdate(BaseModel):
    """Body for PUT /spare-parts/{id} (admin) — restock / edit. All optional."""

    part_name: Optional[str] = Field(None, max_length=120)
    quantity_in_stock: Optional[int] = Field(None, ge=0)
    min_stock_level: Optional[int] = Field(None, ge=0)
    location: Optional[str] = Field(None, max_length=80)
    unit_cost: Optional[float] = Field(None, ge=0)


class PartUsage(BaseModel):
    """One part consumed during a work-order completion."""

    spare_part_id: UUID
    quantity: int = Field(1, ge=1)


# ── Response Schemas ─────────────────────────────────────────────────

class SparePartResponse(BaseModel):
    """Full spare-part representation (low_stock computed)."""

    id: UUID
    part_name: str
    part_number: str
    quantity_in_stock: int
    min_stock_level: int
    location: Optional[str] = None
    unit_cost: Optional[float] = None
    equipment_id: Optional[UUID] = None
    low_stock: bool = False
