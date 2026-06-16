"""Application-wide configuration constants.

Secrets (database URL, JWT key) are loaded from a `.env` file in the
project root so they are never hardcoded. Everything else is a plain
constant.
"""

import os

from dotenv import load_dotenv

# Load variables from the project-root .env into the environment.
load_dotenv()

# ── Anomaly Detection ────────────────────────────────────────────────

THRESHOLD: float = 0.65
MODEL_VERSION: str = "v1.0"
SERVICE_NAME: str = "Predictive Maintenance API"

# ── Database ─────────────────────────────────────────────────────────

DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123@localhost:5432/predictive_maintenance",
)

# ── JWT / Authentication ─────────────────────────────────────────────

SECRET_KEY: str = os.getenv(
    "SECRET_KEY",
    "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7",
)
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
