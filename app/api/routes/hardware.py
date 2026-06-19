"""Hardware API — ESP32 ingestion (device-key) + dashboard reads (JWT-light).

Endpoints:
  POST /hardware/ingest          device-key  — ESP32 1 Hz sample
  GET  /hardware/status          open        — connection, live gauges, schematic, Track B
  GET  /hardware/pipeline        open        — Track A pipeline demo (NOT a detection)
  POST /hardware/inject          auth        — manual schematic fault (visualization)
  POST /hardware/trigger/config  auth        — tune the physical trigger
  POST /hardware/trigger/banner/clear  auth   — dismiss the active banner

Auth split mirrors the dashboard routes: device writes via a static key, humans
read openly and mutate behind a JWT.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core import config
from app.schemas.hardware_schema import HardwareIngest, ManualInjection, TriggerConfig
from app.services import hardware_ingest, hardware_track_a
from app.services.hardware_track_b import track_b
from app.services.replay_service import ReplayController
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/hardware", tags=["Hardware"])

# broken middle gauge (P-Sensor 2) — OFFLINE everywhere, never shows a number
TP3_OFFLINE = {"channel": "TP3", "label": "TP3 · After Filter (P-Sensor 2)",
               "online": False, "value": None, "unit": "kPa",
               "fault": "sensor offline"}


def require_device_key(x_device_key: str = Header(default=None)):
    """Lightweight static device-key check for the ESP32 (not JWT)."""
    if not x_device_key or x_device_key != config.HARDWARE_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid or missing device key")


# ── ESP32 ingestion (device-key) ─────────────────────────────────────
@router.post("/ingest", summary="ESP32 1 Hz sample",
             dependencies=[Depends(require_device_key)])
def ingest(payload: HardwareIngest) -> dict:
    ack = hardware_ingest.buffer.add(payload)          # raw buffer (both tracks read)
    track_b.on_ingest(payload)                         # physical trigger (primary)
    return {"ok": True, **ack}


# ── dashboard reads (open, like GET /dashboard) ──────────────────────
@router.get("", summary="Hardware page status")
def hardware_status() -> dict:
    connected = hardware_ingest.buffer.connected()
    latest = hardware_ingest.buffer.latest()
    gauges = {
        "TP2": {"channel": "TP2", "label": "TP2 · After Pump", "online": connected,
                "unit": "kPa",
                "value": (latest["after_pump"] if (connected and latest) else None)},
        "Reservoirs": {"channel": "Reservoirs", "label": "Reservoirs · Tank",
                       "online": connected, "unit": "kPa",
                       "value": (latest["tank"] if (connected and latest) else None)},
        "TP3": dict(TP3_OFFLINE),   # always offline, never a number
    }
    return {
        "connected": connected,
        "fallback": None if connected else "dataset-replay",
        "last_sample": (latest["ts"] if latest else None),
        "gauges": gauges,
        "series": hardware_ingest.buffer.display_series(),
        "track_b": track_b.status(),
        "buffer": hardware_ingest.buffer.stats(),
    }


@router.get("/pipeline", summary="Track A — pipeline demo (NOT a detection)")
def pipeline_demo() -> dict:
    return hardware_track_a.run_pipeline_demo()


# ── dashboard mutations (JWT) ────────────────────────────────────────
@router.post("/inject", summary="Track B — manual schematic fault (visualization)")
def inject(body: ManualInjection, _user=Depends(get_current_user)) -> dict:
    try:
        return track_b.inject(body.component, body.state)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/trigger/config", summary="Tune the Track B physical trigger")
def trigger_config(body: TriggerConfig, _user=Depends(get_current_user)) -> dict:
    if body.scenario is not None and body.scenario not in ReplayController.SCENARIOS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="scenario must be 'F3' or 'F4'")
    return track_b.configure(
        enabled=body.enabled, cooldown_s=body.cooldown_s, scenario=body.scenario,
    )


@router.post("/trigger/banner/clear", summary="Dismiss the active Track B banner")
def clear_banner(_user=Depends(get_current_user)) -> dict:
    track_b.clear_banner()
    return {"ok": True}
