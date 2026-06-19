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

# ── Hardware ingestion (ESP32 prototype) ─────────────────────────────
# Lightweight static device key for the ESP32 -> POST /hardware/ingest.
# This is NOT the JWT login path; the board sends it in the X-Device-Key header.
HARDWARE_API_KEY: str = os.getenv("HARDWARE_API_KEY", "auguard-esp32-dev-key")

# 1 Hz stream; buffer 600 s (10 min) — Track A needs 60 preprocessed 10s rows
# for the IF window; 600 raw samples -> 60 grid rows after resample.
HARDWARE_BUFFER_SECONDS: int = int(os.getenv("HARDWARE_BUFFER_SECONDS", "600"))
HARDWARE_DISCONNECT_TIMEOUT_S: float = float(os.getenv("HARDWARE_DISCONNECT_TIMEOUT_S", "5"))

# Valid live-pressure range (kPa). The firmware clamps to [0, 40]; reject outside.
HARDWARE_KPA_MIN: float = float(os.getenv("HARDWARE_KPA_MIN", "0"))
HARDWARE_KPA_MAX: float = float(os.getenv("HARDWARE_KPA_MAX", "40"))

# ── Track B physical trigger (live TP2 / Reservoirs pressure-drop rule) ──
# Fires when pressure falls by >= DELTA kPa within WINDOW seconds, then loads
# the validated SCENARIO from the existing replay engine. Cooldown prevents
# re-firing the same episode.
HW_TRIGGER_DELTA_KPA: float = float(os.getenv("HW_TRIGGER_DELTA_KPA", "8"))
HW_TRIGGER_WINDOW_S: float = float(os.getenv("HW_TRIGGER_WINDOW_S", "10"))
HW_TRIGGER_COOLDOWN_S: float = float(os.getenv("HW_TRIGGER_COOLDOWN_S", "60"))
HW_TRIGGER_SCENARIO: str = os.getenv("HW_TRIGGER_SCENARIO", "F3")
