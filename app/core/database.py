"""SQLAlchemy database engine and session configuration."""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import DATABASE_URL

# ── Engine & Session ─────────────────────────────────────────────────

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Declarative Base ─────────────────────────────────────────────────

Base = declarative_base()


# ── Dependency ───────────────────────────────────────────────────────

def get_db():
    """Yield a database session and ensure it is closed after use."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
