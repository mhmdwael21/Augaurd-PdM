"""Shared constants for the ML inference layer.

Source of truth for sensor order, failure intervals, and artifact paths.
Sensor order matches the saved metadata (if_metadata.json / rul_metadata.json).
"""
from pathlib import Path

# project root = three levels up:  app/ml/constants.py -> app/ml -> app -> root
ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "AI" / "models"
DATASET_CSV = ROOT / "AI" / "dataset" / "MetroPT3(AirCompressor).csv"

ANALOG_COLS = ["TP2", "TP3", "H1", "DV_pressure", "Reservoirs",
               "Oil_temperature", "Motor_current"]
DIGITAL_COLS = ["COMP", "DV_eletric", "Towers", "MPG", "LPS",
                "Pressure_switch", "Oil_level", "Caudal_impulses"]
FEATURE_COLS = ANALOG_COLS + DIGITAL_COLS  # 15 channels, fixed order

# time-based train/test cut used by the anomaly + RUL notebooks (no leakage)
CUT_DATE = "2020-06-01"

# known failure intervals (all air leak) — used only for evaluation labels
FAILURES = [
    ("2020-04-18 00:00:00", "2020-04-18 23:59:00"),  # F1 (train)
    ("2020-05-29 23:30:00", "2020-05-30 06:00:00"),  # F2 (train)
    ("2020-06-05 10:00:00", "2020-06-07 14:30:00"),  # F3 (test, known)
    ("2020-07-15 14:30:00", "2020-07-15 19:00:00"),  # F4 (test, novel)
]
