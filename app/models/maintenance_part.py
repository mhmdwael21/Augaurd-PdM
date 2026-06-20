"""MaintenancePart ORM model — join: parts consumed by a maintenance record.

Decision D: a join table (not a JSON blob) so stock can be decremented and parts
are queryable. One row per (maintenance record, spare part) with a quantity.
"""

import uuid

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class MaintenancePart(Base):
    """Maintenance ↔ spare-part usage join."""

    __tablename__ = "maintenance_parts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    maintenance_record_id = Column(UUID(as_uuid=True), ForeignKey("maintenance_records.id"), nullable=False)
    spare_part_id = Column(UUID(as_uuid=True), ForeignKey("spare_parts.id"), nullable=False)
    quantity_used = Column(Integer, nullable=False, default=1)

    spare_part = relationship("SparePart", lazy="joined")

    def __repr__(self) -> str:
        return f"<MaintenancePart rec={self.maintenance_record_id} qty={self.quantity_used}>"
