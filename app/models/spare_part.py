"""SparePart ORM model — MRO inventory (parts catalog with stock levels).

Parts are consumed when a work order is completed (via maintenance_parts), which
decrements stock. Low stock is surfaced visually in the UI — no notification
(notifications stay reserved for ML alerts). Read-mostly; seeded on startup.
"""

import uuid

from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class SparePart(Base):
    """Spare parts table — inventory catalog."""

    __tablename__ = "spare_parts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    part_name = Column(String(120), nullable=False)
    part_number = Column(String(60), unique=True, nullable=False, index=True)
    quantity_in_stock = Column(Integer, nullable=False, default=0)
    min_stock_level = Column(Integer, nullable=False, default=0)
    location = Column(String(80), nullable=True)
    unit_cost = Column(Float, nullable=True)
    # Compatible asset (nullable = generic / fits any).
    equipment_id = Column(UUID(as_uuid=True), ForeignKey("equipment.id"), nullable=True)

    def __repr__(self) -> str:
        return f"<SparePart {self.part_number} qty={self.quantity_in_stock}>"
