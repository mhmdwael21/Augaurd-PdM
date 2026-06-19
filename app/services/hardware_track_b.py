"""Track B — PHYSICAL TRIGGER + VALIDATED DETECTION.

Two paths, physical is PRIMARY:

  1. Physical trigger (primary): two counter-based rules evaluated on every
     1 Hz sample (exact logic from hardware/Final.py):

     Tank leak   — if tank < last_tank, increment leak_counter; else reset.
                   Counter >= 2 -> fire. (No ap>0 guard — pump is often
                   off during prototype deflation tests.)
     Air pump    — if after_pump < last_ap, increment ap_drop_counter;
                   else reset. Counter >= 2 -> fire.

     Each counter resets to 0 after firing to prevent spam. When either
     fires, the validated F3 (default) or F4 scenario is loaded from the
     EXISTING replay engine so the full diagnostic renders on validated data,
     never on the hardware padded row.

  2. Manual injection (secondary): the FAULT-> buttons set a schematic
     component's fault state. This is a visualization control only — it reads
     as "simulated", never as measured. Physical stays primary.

REUSE: detection/diagnostic come entirely from replay_service + the existing
InferenceEngine/decision layer. This module only decides WHEN to start the
validated replay and tracks presentation state.
"""
import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone

from app.core import config
from app.services import replay_service

logger = logging.getLogger(__name__)

SCHEMATIC_COMPONENTS = ["pump", "valve_in", "valve_out", "filter", "tank"]


class TrackB:
    def __init__(self):
        self._lock = threading.Lock()
        # trigger config (live-tunable)
        self.enabled = True
        self.cooldown_s = config.HW_TRIGGER_COOLDOWN_S
        self.scenario = config.HW_TRIGGER_SCENARIO
        # state
        self._last_fire = 0.0
        self._events = deque(maxlen=50)
        self._banner = None
        # counter state (Final.py logic — not locked; only touched by ingest thread)
        self._last_tank = None
        self._leak_counter = 0
        self._last_ap = None
        self._ap_drop_counter = 0
        # schematic fault state (manual injection) — default NORMAL, not measured
        self._components = {c: "NORMAL" for c in SCHEMATIC_COMPONENTS}

    # ── primary: physical trigger, evaluated on every ingest ─────────
    def on_ingest(self, payload):
        """Evaluate the two counter-based rules (exact logic from hardware/Final.py).

        payload: the validated HardwareIngest object (has .after_pump and .tank).
        Counters reset to 0 on each fire to prevent alert spam.
        """
        if not self.enabled:
            return

        ap = float(payload.after_pump)
        tank = float(payload.tank)

        # -- Tank leak: tank is continuously decreasing (any amount) --
        # NOTE: no ap>0 guard — on the prototype the pump side often reads 0
        # while the tank is still deflating, which would permanently block detection.
        if self._last_tank is not None:
            if tank < self._last_tank:
                self._leak_counter += 1
            else:
                self._leak_counter = 0

            if self._leak_counter >= 2:
                self._leak_counter = 0
                self._fire("tank_leak", ap, tank)

        # -- Air pump problem: after_pump continuously decreasing --
        if self._last_ap is not None:
            if ap < self._last_ap:
                self._ap_drop_counter += 1
            else:
                self._ap_drop_counter = 0

            if self._ap_drop_counter >= 2:
                self._ap_drop_counter = 0
                self._fire("air_pump", ap, tank)

        self._last_tank = tank
        self._last_ap = ap

    def _fire(self, kind, ap, tank):
        now = time.time()
        with self._lock:
            if now - self._last_fire < self.cooldown_s:
                return
            self._last_fire = now
            scenario = self.scenario
            if kind == "tank_leak":
                title = "Tank leak detected"
                detail = (f"Tank pressure is continuously decreasing "
                          f"(tank={tank:.1f} kPa, pump={ap:.1f} kPa) — "
                          f"loading validated {scenario} diagnostic.")
            else:
                title = "Air pump problem detected"
                detail = (f"After-pump pressure is continuously decreasing "
                          f"(ap={ap:.1f} kPa) — "
                          f"loading validated {scenario} diagnostic.")
            event = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "kind": kind,
                "source": "physical",
                "after_pump_kpa": round(ap, 2),
                "tank_kpa": round(tank, 2),
                "loaded_scenario": scenario,
            }
            self._events.appendleft(event)
            self._banner = {
                "active": True,
                "ts": event["ts"],
                "title": title,
                "detail": detail,
                "scenario": scenario,
            }
        # Load the validated scenario from the EXISTING engine (outside the lock).
        # The replay loop + decision layer then produce the real diagnostic/alert.
        try:
            replay_service.control(scenario=scenario, reset=True, playing=True)
        except Exception:
            logger.exception("Track B: failed to start validated replay")
        logger.info("Track B physical trigger: kind=%s ap=%.1f tank=%.1f -> scenario %s",
                    kind, ap, tank, scenario)

    # ── secondary: manual injection (visualization only) ─────────────
    def inject(self, component, state) -> dict:
        if component not in self._components:
            raise ValueError(f"unknown component '{component}'")
        with self._lock:
            self._components[component] = state
        return {"component": component, "state": state,
                "source": "manual", "presented_as": "simulated", "measured": False}

    # ── config + readout ─────────────────────────────────────────────
    def configure(self, *, enabled=None, cooldown_s=None, scenario=None) -> dict:
        with self._lock:
            if enabled is not None:
                self.enabled = bool(enabled)
            if cooldown_s is not None:
                self.cooldown_s = float(cooldown_s)
            if scenario in replay_service.ReplayController.SCENARIOS:
                self.scenario = scenario
        return self._trigger_state()

    def clear_banner(self):
        with self._lock:
            self._banner = None

    def _trigger_state(self) -> dict:
        remaining = max(0.0, self.cooldown_s - (time.time() - self._last_fire)) \
            if self._last_fire else 0.0
        return {
            "enabled": self.enabled,
            "cooldown_s": self.cooldown_s,
            "scenario": self.scenario,
            "cooldown_remaining_s": round(remaining, 1),
            "leak_counter": self._leak_counter,
            "ap_drop_counter": self._ap_drop_counter,
        }

    def status(self) -> dict:
        with self._lock:
            return {
                "trigger": self._trigger_state(),
                "banner": self._banner,
                "events": list(self._events),
                "components": [
                    {"id": c, "state": s, "measured": False,
                     "presented_as": "simulated"}
                    for c, s in self._components.items()
                ],
            }


# module singleton
track_b = TrackB()
