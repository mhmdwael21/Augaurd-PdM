"""End-to-end smoke test for the hardware backend endpoints.

Runs against http://localhost:8000 — start the backend first with:
    uvicorn app.main:app

Tests (in order):
  1. POST /hardware/ingest  — no key  -> 401
  2. POST /hardware/ingest  — bad key -> 401
  3. POST /hardware/ingest  — out-of-range -> 422
  4. POST /hardware/ingest  — 60 valid samples (TP2 steady, then pressure drop)
  5. GET  /hardware          — check connected, live gauges, TP3 offline
  6. GET  /hardware/pipeline — Track A: check label, status, feature vector
  7. POST /hardware/ingest  — pressure drop (TP2: 30->10) to fire Track B trigger
  8. GET  /hardware          — confirm Track B banner is active
  9. POST /hardware/trigger/banner/clear — needs JWT (expect 401 if no token given)
"""
import sys
import time
import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
DEVICE_KEY = "auguard-esp32-dev-key"


def req(method, path, *, body=None, headers=None, expect=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json", **(headers or {})}
    rq = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(rq, timeout=10) as r:
            status = r.status
            resp = json.loads(r.read())
    except urllib.error.HTTPError as e:
        status = e.code
        try:
            resp = json.loads(e.read())
        except Exception:
            resp = {}

    mark = "OK" if (expect is None or status == expect) else "FAIL"
    color = "\033[32m" if mark == "OK" else "\033[31m"
    print(f"  {color}[{mark}]\033[0m  {method:5} {path:35} → {status}")
    if mark == "FAIL":
        print(f"         expected {expect}, got {status}: {resp}")
    return status, resp


VALID = {"after_pump": 30, "after_filter": 12, "tank": 28,
         "raw_ap": -2003100, "raw_af": -62000, "raw_tk": -612000}

print("\n=== HARDWARE ENDPOINT SMOKE TEST ===\n")

# ── auth ──────────────────────────────────────────────────────────────
print("── Auth ──")
req("POST", "/hardware/ingest", body=VALID, expect=401)
req("POST", "/hardware/ingest", body=VALID, headers={"X-Device-Key": "wrong"}, expect=401)

# ── validation ────────────────────────────────────────────────────────
print("\n── Range validation ──")
bad = {**VALID, "after_pump": 999}
req("POST", "/hardware/ingest", body=bad, headers={"X-Device-Key": DEVICE_KEY}, expect=422)
bad2 = {**VALID, "tank": -5}
req("POST", "/hardware/ingest", body=bad2, headers={"X-Device-Key": DEVICE_KEY}, expect=422)

# ── ingest 60 steady samples (fill the buffer) ───────────────────────
print("\n── Ingesting 60 steady samples (TP2=30, Reservoirs=28) ──")
for i in range(60):
    status, resp = req("POST", "/hardware/ingest",
                       body=VALID, headers={"X-Device-Key": DEVICE_KEY}, expect=200)
    if i == 0:
        print(f"         first ack: {resp}")
sys.stdout.flush()

# ── status check ─────────────────────────────────────────────────────
print("\n── GET /hardware (status) ──")
status, hw = req("GET", "/hardware", expect=200)
g = hw.get("gauges", {})
print(f"         connected  : {hw.get('connected')}")
print(f"         TP2  online={g.get('TP2',{}).get('online')}  value={g.get('TP2',{}).get('value')}")
print(f"         TP3  online={g.get('TP3',{}).get('online')}  value={g.get('TP3',{}).get('value')}  ← must be None/False")
print(f"         Res  online={g.get('Reservoirs',{}).get('online')}  value={g.get('Reservoirs',{}).get('value')}")
print(f"         buffer samples: {hw.get('buffer',{}).get('buffered')}")

# guard: TP3 must never show a number
if g.get("TP3", {}).get("value") is not None:
    print("  \033[31m[GUARDRAIL FAIL]\033[0m TP3.value is not None!")
else:
    print("  \033[32m[GUARDRAIL OK]\033[0m  TP3 value is None")

# ── Track A pipeline demo ─────────────────────────────────────────────
print("\n── GET /hardware/pipeline (Track A) ──")
status, pipe = req("GET", "/hardware/pipeline", expect=200)
print(f"         label       : {pipe.get('label')}")
print(f"         status      : {pipe.get('pipeline_status')}")
print(f"         raw Hz      : {pipe.get('raw_hz_samples')}")
print(f"         10s rows    : {pipe.get('grid_10s_rows')}")
fv = pipe.get("feature_vector", {})
print(f"         TP2 (live)  : {fv.get('TP2')}  ← raw kPa, unscaled")
print(f"         TP3 (base)  : {fv.get('TP3')}  ← baseline median, not after_filter")
print(f"         Reservoirs  : {fv.get('Reservoirs')}")
if "NOT" not in (pipe.get("label") or ""):
    print("  \033[31m[GUARDRAIL FAIL]\033[0m Track A label missing 'NOT a detection'!")
else:
    print("  \033[32m[GUARDRAIL OK]\033[0m  Track A label contains 'not a detection'")

# ── Track B trigger: inject a sharp pressure drop ─────────────────────
print("\n── Track B physical trigger (sharp TP2 drop: 30 → 10 kPa) ──")
drop = {**VALID, "after_pump": 10}   # 20 kPa drop >> threshold of 8
req("POST", "/hardware/ingest", body=drop, headers={"X-Device-Key": DEVICE_KEY}, expect=200)
# give track_b.on_ingest a moment to evaluate
time.sleep(0.1)

status, hw2 = req("GET", "/hardware", expect=200)
tb = hw2.get("track_b", {})
banner = tb.get("banner")
events = tb.get("events", [])
print(f"         banner active : {banner.get('active') if banner else False}")
if banner:
    print(f"         banner detail : {banner.get('detail')}")
if events:
    e = events[0]
    print(f"         event channel : {e.get('channel')}  drop={e.get('drop_kpa')} kPa  scenario={e.get('loaded_scenario')}")

# ── banner/clear needs JWT ────────────────────────────────────────────
print("\n── POST /hardware/trigger/banner/clear without token -> 403 (no bearer) ──")
req("POST", "/hardware/trigger/banner/clear", expect=403)

print("\n=== DONE ===\n")
