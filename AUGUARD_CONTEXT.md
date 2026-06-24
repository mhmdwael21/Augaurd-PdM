# AUGUARD — Master Project Context

> **Dynamic document.** Update the changelog below each session when meaningful changes are made.
> Read this file at the start of every new session before doing anything else.

---

## Changelog

| Date | Session Summary |
|------|----------------|
| 2026-06-19 | Initial context document created from full codebase exploration |
| 2026-06-19 | Added ESP32 hardware integration (Track A pipeline demo + Track B physical trigger) — see Section 21 |
| 2026-06-20 | Alert severity rework (IF-score bands), FAILURE state removed, inference_log model added — see Section 22 |
| 2026-06-21 | Phase 1 of data-model expansion: asset-centric layer (equipment, sensors, FMEA failure_modes) + alert/log stamping + Fleet/Asset-Detail UI, FMEA alert cards, per-alert asset chips — see Section 23 |
| 2026-06-21 | Phase 2 (work_orders + auto-spawn on HIGH/CRITICAL) and Phase 3 (maintenance_records + outcome feedback + precision/MTTR KPIs) — backend + frontend (Work Orders + Maintenance pages) — see Section 24 |
| 2026-06-21 | Phase 4 (spare_parts + maintenance_parts MRO inventory): parts consumed on WO completion → stock decrement, low-stock flag, Inventory section + parts picker on the UI — see Section 25. **Data-model expansion COMPLETE.** Top nav trimmed/grouped. |
| 2026-06-24 | Novel Failure Capture feedback loop: `novel_failure_candidates` table captures every UNKNOWN-verdict anomaly (labelled with the LSTM localizer diagnosis) as future training data; captured in decision_service (try/except, additive); `/novel-failures` routes; sticky "NOVEL FAILURE DETECTED" Dashboard card — see Section 26. ML pipeline untouched. |

---

## 1. Executive Summary

**Auguard** is a full-stack AI-powered **Predictive Maintenance (PdM)** system for metro air-compressor units (APUs). It continuously monitors 15 sensor channels to detect anomalies, classify failure patterns, predict remaining useful life (RUL), and localize faulty components — all visualized through a role-based web dashboard with alert workflow management.

**Dataset:** MetroPT-3 (Porto Metro, Portugal) — 1.5M rows, Feb–Sep 2020, 15 sensors (7 analog, 8 digital), 4 documented air-leak failures (F1–F4), 10-second sampling interval.

**Architecture:** React (Vite) frontend ↔ FastAPI backend ↔ PostgreSQL database, with 4 trained ML models running in-process (no separate model server). A background replay loop streams test data to simulate live operation.

**GitHub:** `github.com/mhmdwael21/Augaurd-PdM`

**Graduation deadline:** April 2026

---

## 2. Top-Level Directory Structure

```
Full-Project/
├── .env                          # DB URL, JWT secret, token expiry
├── create_db.py                  # One-time DB init helper
├── AUGUARD_CONTEXT.md            # THIS FILE — master context (update every session)
├── SYSTEM_EXPLAINED.md           # Defense-ready walkthrough
├── PROJECT_STATUS.md             # Scope + completed/pending items
├── SMARTMETRO_PLAN.md            # Integration spec (Phases 0–4)
├── MOHAMED_CONTEXT.md            # Mohamed's background + project brief
│
├── AI/                           # ML training & model artifacts
│   ├── dataset/
│   │   ├── MetroPT3(AirCompressor).csv    (209 MB raw)
│   │   └── MetroPT3_labeled.csv           (200 MB labeled)
│   ├── models/                   # Saved artifacts loaded at startup
│   │   ├── if_anomaly.pkl        # Isolation Forest (5.6 MB)
│   │   ├── if_threshold.pkl      # IF decision threshold
│   │   ├── if_metadata.json      # Feature order, stats
│   │   ├── lstm_ae.keras         # LSTM Autoencoder (862 KB)
│   │   ├── lstm_metadata.json    # Window size, threshold, feature names
│   │   ├── lstm_scaler_sd.pkl    # StandardScaler (shared IF + LSTM)
│   │   ├── lstm_fault_localization.csv  # Per-window top-3 culprit sensors
│   │   ├── xgb_classifier_calibrated.pkl  # CalibratedClassifierCV(XGBoost)
│   │   ├── xgb_scaler_minmax.pkl
│   │   ├── xgb_feature_cols.pkl  # 43-feature column names in training order
│   │   ├── rul_lgbm.pkl          # LightGBM RUL regressor (23 MB)
│   │   ├── rul_scaler_sd.pkl
│   │   ├── rul_feature_cols.pkl  # 143-feature column names
│   │   └── rul_metadata.json
│   └── (6 Jupyter notebooks)
│       ├── PdM-EDA.ipynb
│       ├── PdM-Preprocessing.ipynb
│       ├── PdM-Anomaly.ipynb
│       ├── Fault_Localization_PdM_Anomaly.ipynb
│       ├── PdM-Classifier.ipynb
│       └── PdM-RUL.ipynb
│
├── app/                          # FastAPI backend
│   ├── main.py                   # Entry point, lifespan, CORS, router mounting
│   ├── requirements.txt          # Python deps (Python 3.12 REQUIRED)
│   ├── core/
│   │   ├── config.py             # Settings (DB URL, JWT, anomaly threshold)
│   │   └── database.py           # SQLAlchemy engine, SessionLocal, get_db
│   ├── models/                   # ORM table definitions
│   │   ├── user.py
│   │   ├── alert.py
│   │   └── notification.py
│   ├── schemas/                  # Pydantic request/response contracts
│   │   ├── user_schema.py
│   │   ├── alert_schema.py
│   │   ├── anomaly_schema.py     # AnomalyDetectionResponse, ReplayControl
│   │   └── notification_schema.py
│   ├── api/routes/               # HTTP endpoints (thin wrappers)
│   │   ├── auth.py               # POST /auth/{register,login}, GET /auth/users
│   │   ├── anomaly.py            # GET /dashboard, POST /dashboard/{replay,upload}
│   │   ├── alerts.py             # CRUD + assign + status + escalate
│   │   ├── notifications.py      # Send, list, mark-read
│   │   ├── dashboard.py          # GET /admin_panel
│   │   └── reports.py            # GET /reports/alerts (read-only history)
│   ├── services/                 # Business logic
│   │   ├── auth_service.py
│   │   ├── alert_service.py
│   │   ├── notification_service.py
│   │   ├── replay_service.py     # Background replay loop + CSV batch scoring
│   │   ├── decision_service.py   # Snapshot → Alert → Notification persistence
│   │   ├── anomaly_service.py    # LEGACY (superseded by ml.inference)
│   │   └── mock_service.py       # LEGACY (early testing)
│   ├── ml/                       # ML inference layer
│   │   ├── constants.py          # FEATURE_COLS, FAILURES, paths
│   │   ├── preprocessing.py      # clean_resample_segment, load_raw_csv
│   │   ├── features.py           # if_window_features (90 stats), lstm_per_sensor_error
│   │   ├── classifier.py         # classifier_window_features (43 stats)
│   │   ├── rul.py                # rul_feature_names, build_runs_and_rul
│   │   ├── artifacts.py          # Loaders for all model files
│   │   ├── registry.py           # ModelRegistry singleton (load once at startup)
│   │   ├── buffer.py             # RawBuffer (rolling window of raw rows)
│   │   ├── inference.py          # InferenceEngine: push() → snapshot (core pipeline)
│   │   └── SNAPSHOT_CONTRACT.md  # Frozen backend↔frontend schema
│   └── utils/
│       ├── dependencies.py       # get_current_user (JWT), require_role (RBAC)
│       ├── jwt_handler.py        # create_access_token, decode_access_token
│       └── security.py           # hash_password, verify_password (bcrypt)
│
├── frontend/                     # React (Vite) frontend
│   ├── package.json              # React 18.3.1, React Router 6.26.1, Vite 5.4
│   ├── vite.config.js
│   ├── vercel.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx               # Router + RequireAuth + RequireAdmin guards
│       ├── api.js                # Fetch wrapper (JWT injection, DEMO flag)
│       ├── mockApi.js            # Canned mock responses (VITE_DEMO_MODE=true)
│       ├── tokens.js             # Color/spacing design constants
│       ├── context/
│       │   └── AuthContext.jsx   # token + role + username (localStorage)
│       ├── hooks/
│       │   ├── usePoll.js        # Auto-refresh timer
│       │   ├── useResponsive.js  # Media query breakpoints
│       │   └── useFetch.js
│       ├── components/
│       │   ├── Topbar.jsx
│       │   ├── AnomalyChart.jsx  # Canvas line chart (IF score, threshold line)
│       │   ├── StatusBadge.jsx
│       │   └── Toast.jsx
│       ├── pages/
│       │   ├── Landing.jsx       # Public marketing page
│       │   ├── Auth.jsx          # Login + Register tabs
│       │   ├── Dashboard.jsx     # Live monitoring (anomaly, sensors, RUL, localization)
│       │   ├── Alerts.jsx        # Alert management (table, filters, lifecycle)
│       │   ├── Notifications.jsx # Notification inbox + compose (admin)
│       │   ├── Reports.jsx       # Alert history + PDF export
│       │   └── Users.jsx         # User management (admin only)
│       └── utils/
│
└── scripts/                      # Validation + utility
    ├── parity_if.py
    ├── parity_lstm.py
    ├── parity_classifier.py
    ├── parity_rul.py
    ├── smoke_inference.py
    ├── seed_users.py
    ├── test_phase3_alert.py
    ├── test_phase4_http.py
    ├── verify_tiers.py
    └── repopulate_history.py
```

---

## 3. Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| username | String(50) UNIQUE | login identifier |
| email | String(120) UNIQUE | |
| password_hash | String(256) | bcrypt |
| role | Enum(admin\|technician\|operator) | default: operator |
| created_at | DateTime | default utcnow |

### `alerts`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| severity | Enum(low\|medium\|high\|critical) | from score+RUL+verdict |
| timestamp | DateTime | creation time |
| predicted_failure | String(255) | e.g. "Pressure Fault — TP2, H1 (UNKNOWN)" |
| recommended_action | Text | from fault type mapping |
| status | Enum(new\|acknowledged\|resolved) | lifecycle |
| assigned_to | UUID FK→users | nullable |
| anomaly_score | Float | 0–1 normalized IF score |
| created_by | String(100) | default "system" |

**Alert lifecycle:** NEW → ACKNOWLEDGED → RESOLVED (forward only)

### `notifications`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| subject | String(200) | |
| body | Text | |
| recipient_type | Enum(user\|group\|all) | |
| recipient_id | UUID FK→users | if type=user |
| target_role | String(50) | if type=group |
| created_by | UUID FK→users | sender |
| timestamp | DateTime | |
| is_read | Boolean | per recipient |
| type | Enum(alert\|system\|broadcast) | |
| alert_id | UUID FK→alerts | nullable link to originating alert |

---

## 4. The Four ML Models

| # | Model | Algorithm | Task | Window | Input Features | Key Metric |
|---|-------|-----------|------|--------|----------------|-----------|
| 1 | **Anomaly Detector** | Isolation Forest | Primary detection (unsupervised) | 60 rows | 90 stats | Recall 99.5%, ROC-AUC 0.957 |
| 2 | **Localizer** | LSTM Autoencoder | Fault localization (unsupervised) | 60 rows | raw (60×15) | ROC-AUC 0.800 per sensor |
| 3 | **Classifier** | XGBoost (calibrated) | Known vs novel (supervised binary) | 360 rows | 43 stats | Confidence gate 0.60 |
| 4 | **RUL Regressor** | LightGBM | Remaining useful life (supervised) | 180 rows | 143 stats | MAE 21.6 ± 5.0 h |

---

## 5. ML Inference Pipeline (One Row Through the System)

```
1. ReplayController.load()
   Loads CSV (post-2020-06-01), segments by scenario (F3/F4)
   Warmup: 360 rows through engine (buffer fill, no output)

2. replay_service._loop()  [background thread]
   Every tick → pick next row → engine.push(row, ts)

3. InferenceEngine.push(row) [app/ml/inference.py]
   ├── Append to RawBuffer (rolling 360+margin)
   ├── Update sensor_hist (headline channels)
   └── Call snapshot()

4. InferenceEngine.snapshot()
   ├── IF BRANCH (always)
   │   window=60 rows → StandardScaler → 90-stat features → isolation_forest.decision_function()
   │   status_machine: NORMAL → DRIFT (score≥0.5) → ANOMALY (3 consecutive ≥0.65)
   │   alert_event fires on NORMAL→ANOMALY transition (once per episode)
   │
   ├── CLASSIFIER BRANCH (always)
   │   window=360 rows → 43-stat features → MinMaxScaler → xgb.predict_proba()
   │   verdict: P(anomaly) ≥ 0.60 → "KNOWN", else "UNKNOWN", else "NORMAL"
   │
   ├── LSTM BRANCH (gated: only when IF anomaly flag set)
   │   window=60 rows → StandardScaler → lstm.predict() → per-sensor reconstruction error
   │   weighted (analog 1.0, digital 0.3)
   │   top-3 sensors → fault_type → action string
   │
   ├── RUL BRANCH (gated: only when IF anomaly flag set)
   │   window=180 rows → 143-stat features → StandardScaler → rul_model.predict()
   │   hours ∈ [0, 168], zone: NOMINAL (>48h) | DEGRADATION (12–48h) | CRITICAL (<12h)
   │
   └── Returns SNAPSHOT dict (see Section 8)

5. decision_service.handle_snapshot(snap)
   If alert_event:
   ├── Create Alert (severity from score+RUL+verdict)
   ├── Persist to PostgreSQL
   └── Create broadcast Notification (all users)

6. Frontend polls GET /dashboard every 1s → renders snapshot
```

### Feature Engineering Detail

**Isolation Forest (90 features, 60-row window)**
Per sensor: mean, std, min, max, RMS, slope → 6 × 15 = 90

**LSTM Autoencoder (raw sequence, 60-row window)**
Input: (60, 15) matrix → reconstruction error per sensor (weighted)

**XGBoost Classifier (43 features, 360-row window)**
Per analog (7): mean, std, min, max, range → 5 × 7 = 35
Per digital (8): mean → 8
**Total: 43**

**LightGBM RUL (143 features, 180-row window)**
9 stat blocks × 15 channels = 135 + 8 digital transitions = 143
Stat blocks: mean, std, min, max, range, last, slope, dlast, energy

### Preprocessing Parity (CRITICAL)

Each model has its own preprocessing pipeline that the backend reproduces exactly:

| Model | Snap | Resample | Gap handling | Window stride |
|-------|------|----------|-------------|---------------|
| IF + LSTM | floor('10s') | 10s freq | <120s: interp+ffill, ≥120s: segment cut | 10 (IF), 5 (LSTM) |
| Classifier | round('10s') | analog mean, digital mean | interp+ffill+bfill unlimited | 60 |
| RUL | floor('10s') | — | <120s: interp+ffill+bfill limit=12, ≥120s: cut | 10 |

**Validation:** `scripts/parity_*.py` verify live backend matches notebook outputs bit-for-bit.

---

## 6. Replay Engine (`app/services/replay_service.py`)

No live hardware — the replay engine streams F3/F4 test data at variable speed.

```
ReplayController
├── _rows: dict[scenario → list[(timestamp, row_values)]]
├── _warm: dict[scenario → pre-warmed engine template]   ← instant scenario switch (<1ms)
├── _engine: current running engine clone
├── _generation: version counter (prevents stale tick publishing)
├── _latest: cached snapshot (served to frontend)
│
├── load()          — Load CSV, filter by scenario windows, pre-warm engines
├── _loop()         — Background thread: push row → publish snapshot → sleep(BASE/speed)
├── control()       — Instant: swap pre-warmed engine, update params under lock
└── run_csv(bytes)  — Isolated batch scoring for uploaded CSV
```

**Concurrency:** Lock held only for fast field swaps; slow inference runs outside lock.

**Scenarios:**
- **F3:** 2020-06-05 05:00–13:00 (known pressure failure, classifier confident)
- **F4:** 2020-07-15 11:00–17:00 (novel failure, classifier low-confidence → "UNKNOWN")

---

## 7. Decision Service (`app/services/decision_service.py`)

Converts snapshot anomaly events into persistent DB records.

**System user:** `auguard-ai` (UUID `a1a1a1a1-0000-0000-0000-000000000001`, role admin) — seeded idempotently.

**Severity mapping:**
```
CRITICAL if: zone == "CRITICAL" OR score ≥ 0.85 OR verdict == "UNKNOWN"
HIGH     if: score ≥ 0.75 OR zone == "DEGRADATION"
MEDIUM   otherwise
```

**Alert fire rule:** `alert_event` fires once per anomaly episode (3 consecutive anomalous windows → latch; re-arms after 5 consecutive sub-threshold windows).

**Fault type → action:**
```
Pressure Fault → "Inspect pneumatic circuit for air leaks — valves, seals, piping."
Thermal Fault  → "Check oil cooling system and motor load."
Flow Fault     → "Inspect flow meters and air intake."
Digital Fault  → "Verify switch/sensor wiring and actuator states."
```

---

## 8. Snapshot Contract (`app/ml/SNAPSHOT_CONTRACT.md`)

Every field served by `GET /dashboard`. **Frozen schema** — backend and frontend both depend on this.

```jsonc
{
  "timestamp": "2020-07-15T14:30:00",
  "status": "NORMAL|DRIFT|ANOMALY|FAILURE|WARMING",
  "anomaly": {
    "score": 0.94,
    "raw_score": -0.0123,
    "threshold": 0.65,
    "history": [0.21, 0.23, ...]
  },
  "sensors": {
    "values": { "TP2": 2.10, ... },
    "headline": [
      { "key": "TP2", "label": "TP2 · Compressor", "unit": "bar",
        "value": 2.10, "min": 0.55, "max": 2.85, "history": [...] }
    ]
  },
  "classifier": {
    "anomaly_probability": 0.41,
    "verdict": "UNKNOWN|KNOWN|NORMAL",
    "confidence": 0.41,
    "gate": 0.60
  },
  "rul": {
    "available": true,
    "hours": 18.0,
    "zone": "NOMINAL|DEGRADATION|CRITICAL",
    "cap": 168,
    "degradation_threshold": 72
  },
  "localization": {
    "available": true,
    "fault_type": "Pressure Fault|Thermal Fault|Flow Fault|Digital Fault|null",
    "action": "Inspect pneumatic circuit...",
    "per_sensor": [{ "sensor": "TP2", "error": 0.71, "rank": 1 }],
    "top3": [{ "sensor": "TP2", "error": 0.71 }]
  },
  "detection": {
    "consecutive_anomalous_windows": 3,
    "alert_recommended": true,
    "alert_event": true,
    "episode_active": true
  },
  "meta": { "model_version": "1.0.0", "dataset": "MetroPT-3" }
}
```

---

## 9. API Endpoints (37 total)

### Auth
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/auth/register` | — | UserCreate → UserResponse [201] |
| POST | `/auth/login` | — | UserLogin → TokenResponse |
| GET | `/auth/users` | admin | → UserResponse[] |

### Dashboard
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/dashboard` | any | → snapshot + replay state |
| POST | `/dashboard/replay` | any | ReplayControl → replay state |
| POST | `/dashboard/upload` | any | CSV → batch results |

### Alerts
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/alerts` | admin | AlertCreate → AlertResponse [201] |
| GET | `/alerts` | any | role-aware filter |
| GET | `/alerts/{id}` | any | |
| PUT | `/alerts/{id}/assign` | admin | |
| PUT | `/alerts/{id}/status` | assigned | |
| PUT | `/alerts/{id}/escalate` | admin | |

### Notifications
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/notifications` | admin | |
| GET | `/notifications` | any | |
| PUT | `/notifications/{id}/read` | any | |

### Reports
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/reports/alerts` | any | `?from_date&to_date&status&severity` |
| GET | `/reports/alerts/{id}` | any | |

---

## 10. Frontend Architecture

**Stack:** React 18.3.1, React Router 6.26.1, Vite 5.4, plain `fetch` (no Axios), no Redux.

### Auth Flow
1. POST `/auth/login` → store token+role+username in `localStorage`
2. `RequireAuth` guard redirects to `/auth` if no token
3. Every API call → `Authorization: Bearer <token>`
4. 401 response → clear storage + redirect

### Polling Intervals
| Page | Data | Interval |
|------|------|----------|
| Dashboard | snapshot | 1s |
| Dashboard | alerts | 5s |
| Dashboard | notifications (badge) | 10s |
| Alerts | alert list | 5s |
| Notifications | notification list | 10s |
| Users | user list | 8s |

### Pages Summary
| Page | Route | Access | Key Features |
|------|-------|--------|-------------|
| Landing | `/` | public | Hero, demo chart, team |
| Auth | `/auth` | public | Login/Register, demo quick-fill |
| Dashboard | `/dashboard` | any auth | Anomaly chart, sensors, RUL, localization, replay controls |
| Alerts | `/alerts` | any auth | Table, filters, lifecycle actions (role-gated) |
| Notifications | `/notifications` | any auth | Inbox, compose (admin) |
| Reports | `/reports` | any auth | Alert history, PDF export |
| Users | `/users` | admin | User table, create form |

### Design System
**Colors:**
- Normal (Olive): `#AEBC74` / `rgba(123,138,67,.14)`
- Drift (Ochre): `#D9A94A` / `rgba(217,169,74,.14)`
- Anomaly (Rust): `#CB5B3C` / `rgba(203,91,60,.16)`
- Primary BG: `#1B2027` (Charcoal)
- Text Primary: `#DFD0B8` (Tan)

**Typography:** Neue Haas Grotesk Display Pro (headings), Satoshi (body, fontshare CDN)

---

## 11. Authentication & Authorization

**JWT (HS256)** — payload: `{ sub: username, role, exp }`

**bcrypt** for password hashing.

| Role | Permissions |
|------|-------------|
| **admin** | All: create/escalate/assign alerts, send notifications, manage users, restart replay |
| **technician** | View dashboard, own alerts (ACK/RESOLVE), view notifications |
| **operator** | View dashboard, own alerts (ACK/RESOLVE), view notifications |

---

## 12. Sensors Reference

### Analog (7 channels) — continuous
`TP2`, `TP3` (pressure bar), `H1` (pressure bar), `DV_pressure` (pressure bar), `Reservoirs` (reservoir pressure bar), `Oil_temperature` (°C), `Motor_current` (A)

### Digital (8 channels) — binary 0/1
`COMP`, `DV_eletric`, `Towers`, `MPG`, `LPS`, `Pressure_switch`, `Oil_level`, `Caudal_impulses`

**Headline channels (shown in dashboard sparklines):** TP2, H1, Motor_current, Oil_temperature

---

## 13. Known Failure Events (Training Data)

| ID | Start | End | Split | Notes |
|----|-------|-----|-------|-------|
| F1 | 2020-04-18 00:00 | 2020-04-18 23:59 | Train | Air leak ~24h |
| F2 | 2020-05-29 23:30 | 2020-05-30 06:00 | Train | Air leak ~6.5h |
| F3 | 2020-06-05 10:00 | 2020-06-07 14:30 | **Test** | Air leak ~53h — known signature, classifier confident |
| F4 | 2020-07-15 14:30 | 2020-07-15 19:00 | **Test** | Air leak ~4.5h — **novel pattern**, classifier low-confidence → "UNKNOWN" |

**Train/test cut:** 2020-06-01

**Fault type distribution (LSTM localization):**
- Pressure Fault 64.8%: {TP2, TP3, DV_pressure, Reservoirs}
- Digital Fault 34.1%: {COMP, DV_eletric, Towers, MPG, LPS, Pressure_switch, Oil_level}
- Thermal Fault 0.8%: {Oil_temperature, Motor_current}
- Flow Fault 0.3%: {H1, Caudal_impulses}

---

## 14. Environment Variables

**Backend (`.env`):**
```env
DATABASE_URL=postgresql://postgres:postgres123@localhost:5432/predictive_maintenance
SECRET_KEY=09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

**Frontend (`.env.local`):**
```env
VITE_API_URL=http://localhost:8000   # optional; defaults to localhost:8000
VITE_DEMO_MODE=false                 # true = mock data
```

---

## 15. Running the System

```bash
# PostgreSQL must be running
psql -U postgres -c "CREATE DATABASE predictive_maintenance;"

# Backend
cd app
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
# → http://localhost:8000/docs

# Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

**CRITICAL:** Python 3.12 + scikit-learn 1.6.1 (Colab training version). Version mismatch silently corrupts pickle models.

**bcrypt fix** (if `__about__` error): `pip install bcrypt==4.0.1`

### Demo Users
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| tech | tech123 | technician |
| op | op123 | operator |

Seed: `python scripts/seed_users.py`

---

## 16. Key Design Decisions (Defense Talking Points)

| Decision | Rationale |
|----------|-----------|
| Unsupervised IF as primary detector | Only unsupervised model can catch unseen failures (F4) |
| LSTM demoted to localization only | Weak detector (ROC-AUC 0.80); strong at fault localization |
| Classifier as known/novel gate | Dataset has only one fault type; classifier's real job is "new vs seen" |
| 3-consecutive-window alert rule | IF high recall, low precision; persistence removes false alarms |
| In-process inference (no model server) | Right scope for graduation: lower latency, simpler ops |
| Preprocessing parity scripts | Guarantees live pipeline matches training (no silent corruption) |
| Python 3.12 + sklearn 1.6.1 pinned | Pickled models require exact training environment |

---

## 17. Honest Limitations

- **4 failures, all one type (air leak)** — proof-of-concept; generalizes via classifier retraining
- **IF modest precision (~5% false-alert rate)** — mitigated by 3-window rule; many "false positives" are early warnings
- **LSTM weak as detector** — used only for localization by design
- **RUL MAE ≈ 21.6h ± 5h** — 4 failure cycles; tightens with more data
- **F4 classified "novel"** — partly because short/weak, not necessarily different failure type; correct behavior (abstain → let IF catch it)

---

## 18. File Sizes

| Artifact | Size |
|----------|------|
| Dataset (raw) | 209 MB |
| Isolation Forest | 5.6 MB |
| LSTM Autoencoder | 862 KB |
| XGBoost Classifier | ~252 KB |
| LightGBM RUL | 23 MB |
| Frontend node_modules | ~500 MB (git-ignored) |
| Python venv | ~2 GB (git-ignored) |

---

## 19. Team

**SmartMetro Graduation Project:**
Mohamed Wael (primary dev), Eman Mousa, Eman Hussien, Hana Gohar, Fatema Salah, Tasneem Almorsi, Samar Abo Samra

**Dataset:** MetroPT-3, Porto Metro (public research dataset)

---

## 20. Pending / In Progress

> Update this section each session with what was done and what remains.

- [x] ESP32 hardware integration — backend + frontend done, route/service smoke-tested (Section 21)
- [x] Data-model expansion **Phase 1** — equipment + sensors + failure_modes tables, alert/log stamping, Fleet/Asset-Detail UI, FMEA cards, asset chips (Section 23)
- [x] Data-model expansion **Phase 2** — `work_orders` + auto-spawn on HIGH/CRITICAL, Work Orders page (Section 24)
- [x] Data-model expansion **Phase 3** — `maintenance_records` + outcome feedback + precision/MTTR KPIs, Maintenance page (Section 24)
- [x] Data-model expansion **Phase 4** — `spare_parts` + `maintenance_parts`, stock decrement on completion, Inventory UI (Section 25) — **expansion COMPLETE**
- [x] UI: top nav trimmed + grouped (8 tabs, Monitoring | Operations | Analytics/Admin)
- [ ] End-to-end test with the real board on the bench (reflash sketch first — new URL + device key)
- [ ] Tune `HW_TRIGGER_DELTA_KPA` / `HW_TRIGGER_WINDOW_S` against real pressure-drop behaviour

---

## 21. Hardware Integration (ESP32 Prototype)

A real ESP32 bench rig (HX710B pressure sensors) streams at **1 Hz** into the
backend. The integration is split into two strictly separated tracks.

### Sensor mapping (locked)
| ESP32 payload key | Physical | Channel | Treatment |
|---|---|---|---|
| `after_pump` | After Pump | **TP2** | LIVE |
| `tank` | Tank | **Reservoirs** | LIVE |
| `after_filter` | After Filter (P-Sensor 2) | **TP3** | **BROKEN** — received, discarded, OFFLINE everywhere (never shows a number) |

Hardware sends **kPa** (firmware-clamped `[0,40]`); models trained on **bar**.
Live values are **not rescaled** — that is exactly why Track A is a pipeline
check, not a detection.

### Exact ESP32 payload (from `hardware/sketch_jun15a.ino`)
```json
{ "after_pump": <int kPa>, "after_filter": <int kPa>, "tank": <int kPa>,
  "raw_ap": <long>, "raw_af": <long>, "raw_tk": <long> }
```
Posts to `POST /hardware/ingest` with header `X-Device-Key: <HARDWARE_API_KEY>`
(default `auguard-esp32-dev-key` in `.env`). **The board must be reflashed** —
the sketch was updated from `/pressure` (no auth) to the new URL + key header.

### Track A — Pipeline Demo (NOT a detection)
- Builds the 15-channel padded row: TP2←live, Reservoirs←live, the other 13
  (incl. broken TP3)←**training-normal baseline median** (`AI/models/baseline_medians.json`,
  generated by `scripts/compute_baseline.py`).
- **REUSES** `clean_resample_segment` (its step 1 floors to the 10 s grid with
  analog-mean = the required bucket-mean downsample). No new preprocessing.
- Returns preprocessed feature vector + pipeline status ONLY, tagged
  `"pipeline check — not a detection"`. Never feeds a presented score/verdict.

### Track B — Physical Trigger + Validated Detection
- **Primary:** pressure-drop rule on live TP2/Reservoirs (≥ `HW_TRIGGER_DELTA_KPA`
  within `HW_TRIGGER_WINDOW_S`, with cooldown). On fire → logs a real hardware
  event + calls `replay_service.control(scenario=..., reset=True, playing=True)`,
  loading the validated **F3** (default) or F4 scenario. **REUSES** the existing
  replay engine + inference + decision layer — the diagnostic renders on
  validated data, never on the hardware padded row.
- **Secondary:** manual injection — FAULT buttons set a schematic component
  state, flagged `presented_as: "simulated", measured: false`.

### Disconnect fallback
No sample within `HARDWARE_DISCONNECT_TIMEOUT_S` (5 s) → status `connected:false`,
gauges grey, page shows Disconnected; the always-running dataset replay continues
the demo.

### New files
**Backend:** `app/services/hardware_ingest.py` (1 Hz rolling buffer + baseline row
builder), `app/services/hardware_track_a.py`, `app/services/hardware_track_b.py`,
`app/api/routes/hardware.py`, `app/schemas/hardware_schema.py`,
`scripts/compute_baseline.py`. Config added to `app/core/config.py` + `.env`.
Router registered in `app/main.py`.
**Frontend:** `frontend/src/pages/Hardware.jsx` (route in `App.jsx`, tab in
`Topbar.jsx`, API fns in `api.js`).

### Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/hardware/ingest` | device-key | ESP32 1 Hz sample |
| GET | `/hardware` | open | connection, live gauges, schematic, Track B status |
| GET | `/hardware/pipeline` | open | Track A pipeline demo |
| POST | `/hardware/inject` | JWT | manual schematic fault (visualization) |
| POST | `/hardware/trigger/config` | JWT | tune the physical trigger |
| POST | `/hardware/trigger/banner/clear` | JWT | dismiss the banner |

### Guardrails (enforced)
1. Track A's padded row never drives a presented detection (separate module +
   endpoint, output is vector/status only). 2. TP3 padded with a baseline
   constant for the pipeline vector only; UI hardcodes OFFLINE, never a number.
3. Schematic components are `measured:false`. 4. Track A and Track B are
   separate code paths sharing only the read-only buffer.

---

## 22. Session 2026-06-20 Changes

### Alert severity rework (IF-score bands)
Severity is now a pure function of the normalized IF score. The old RUL-primary `_severity()` function is gone.

| Band | Score range | Severity | Persistence gate |
|------|-------------|----------|-----------------|
| 1 | 0.51 – 0.55 | LOW | 30 consecutive readings (~5 min) sustained in drift band |
| 2 | 0.56 – 0.64 | MEDIUM | same as LOW (or episode already has a lower alert) |
| 3 | 0.65 – 0.75 | HIGH | LATCH_N (3) consecutive anomalous windows |
| 4 | ≥ 0.76 | CRITICAL | same as HIGH |

**Escalation trail:** one alert per band per episode (never downgrades, never re-fires same band). Hysteresis re-arm: score < 0.45 for 5 readings resets `max_band` → fresh trail.

**Key constants** (`app/ml/inference.py`):
```python
DRIFT_FLOOR = 0.51; DRIFT_SUSTAIN_N = 30; REARM_LEVEL = 0.45; REARM_N = 5
BAND_EDGES = [(4, 0.76), (3, 0.65), (2, 0.56), (1, 0.51)]
BAND_SEVERITY = {1: "low", 2: "medium", 3: "high", 4: "critical"}
```

**Engine state added:** `max_band`, `drift_run`, `calm` — all on `InferenceEngine`.

**Decision service** (`app/services/decision_service.py`): reads `snap["detection"]["alert_severity"]` directly. LOW/MEDIUM get generic "Sustained drift detected" text; HIGH/CRITICAL get full localization + RUL text.

### FAILURE state removed
State machine now only emits `NORMAL | DRIFT | ANOMALY`. `FAILURE_SCORE` and `FAILURE_RUL_H` constants removed from `inference.py`. Dashboard badge, PHASE map, and replay CSV counter all updated.

### Toast improvements
- Title by severity: "Drift detected" (low/medium), "Anomaly detected" (high), "Critical anomaly detected" (critical)
- Color by severity: yellow `#E8C24A` / orange `#E8923C` / light-red `#E8675A` / dark-red `#C0392B`
- `Toast.jsx` accepts `titleColor` prop (applied to icon + title span)

### Snapshot contract update
`detection` block now includes `"alert_severity": str | null` alongside `"alert_event": bool`.

### inference_log data model (fully implemented, pending first backend run)
New DB table `inference_log` — one row per snapshot written on a data-time cadence.

**Table:** `app/models/inference_log.py`
- `(timestamp, scenario)` unique constraint — dedup across replay loops
- 7 analog channel columns (tp2, tp3, h1, dv_pressure, reservoirs, oil_temperature, motor_current)
- `alert_id` FK stamped via `COALESCE` upsert when an alert fires at that timestamp

**Service:** `app/services/inference_log_service.py` — `write_snapshot(snap, scenario, alert_id=None)`

**Routes** (`app/api/routes/inference.py`, prefix `/inference`):
| Endpoint | Purpose |
|----------|---------|
| `GET /inference/history` | Paginated log with filters (from_date, to_date, status, scenario, limit) |
| `GET /inference/episode/{alert_id}` | ±80 min window around an alert's data-timestamp |
| `GET /inference/stats` | Aggregate counts + distributions |

**Alert model additions** (`app/models/alert.py`):
- `top_sensors` (JSON) — LSTM top-3 at fire time
- `scenario` (VARCHAR 10) — "F3"/"F4"
- `data_timestamp` (TIMESTAMP) — replay data-time at fire time (used to anchor episode window)

These three columns are `ADD COLUMN IF NOT EXISTS` in `main.py` lifespan — safe to run against the existing table.

**Table creation:** `Base.metadata.create_all()` in lifespan creates `inference_log` on first startup after this commit.

**Frontend wiring:**
- `api.js` exports `getInferenceHistory`, `getInferenceStats`, `getInferenceEpisode`
- `Reports.jsx` uses all three: episode timeline chart (±80 min), sensor overlay, RUL curve, fault donut, stats summary row
- `ReportCharts.jsx` — new component with `SensorOverlayChart`, `RulCurveChart`, `FaultDonutChart`

### Files changed (commit 1f6fc2e)
Modified: `app/api/routes/reports.py`, `app/main.py`, `app/ml/inference.py`, `app/models/alert.py`, `app/schemas/alert_schema.py`, `app/services/alert_service.py`, `app/services/decision_service.py`, `app/services/replay_service.py`, `frontend/src/api.js`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Reports.jsx`
New: `app/api/routes/inference.py`, `app/models/inference_log.py`, `app/schemas/inference_log_schema.py`, `app/services/inference_log_service.py`, `frontend/src/components/ReportCharts.jsx`

---

## 23. Data-Model Expansion — Phase 1 (Asset-Centric Layer)

Turns AuGuard from an alert-management app into an **asset-centric PdM system**.
Design docs: `planning/DATA_MODEL_EXPANSION_PLAN.md` + `planning/DATA_MODEL_REFERENCE.md`.
Locked decisions A–H recorded there. **Guardrail:** ML pipeline / `FEATURE_COLS`
untouched; all changes additive; new metadata tables are read-only enrichment.

### New tables
| Table | Purpose | Seed |
|-------|---------|------|
| `equipment` | Asset registry (the monitored APUs) | APU-01 active + APU-02/03 idle (fixed UUIDs in `app/models/equipment.py`) |
| `sensors` | 15 channels as first-class rows (display name, unit, type, status) | 15 rows on APU-01, all `online`, no HW flags (hardware story stays on Prototype page) |
| `failure_modes` | FMEA catalog (category, component, symptoms, action) | 4 rows = the 4 localizer fault categories; actions migrated from `ACTION_MAP` |

### New columns (additive, nullable, `ADD COLUMN IF NOT EXISTS` + backfill)
- `alerts.equipment_id`, `alerts.failure_mode_id`
- `inference_log.equipment_id`

### Stamping (decision/log services — engine stays DB-free, Decision A)
- `decision_service.handle_snapshot`: every alert → `equipment_id = APU-01`;
  `failure_mode_id` resolved from the localizer `fault_type` via
  `failure_mode_service.get_failure_mode_by_fault_type` (None for drift).
- `inference_log_service.write_snapshot`: every row → `equipment_id = APU-01`.

### API (RBAC per Decision G: reads any auth user, writes admin)
`/equipment`, `/sensors` (`?equipment_id=`), `/failure-modes` — all GET list/detail + POST.

### Frontend
- **Fleet** (`/fleet`) — asset grid; **Asset Detail** (`/fleet/:assetId`) — header +
  sensor registry + that asset's alerts. New `Fleet` nav tab.
- **FMEA card** on the Alerts expanded detail (matched failure mode: category,
  name, component, symptoms).
- **Asset chip** (APU-01) on every alert: Alerts list, Dashboard feed, Reports table (ASSET column).

### Key files
New backend: `app/models/{equipment,sensor,failure_mode}.py`,
`app/schemas/{equipment,sensor,failure_mode}_schema.py`,
`app/services/{equipment,sensor,failure_mode}_service.py`,
`app/api/routes/{equipment,sensors,failure_modes}.py`,
`scripts/{seed_equipment,seed_sensors,seed_failure_modes,reset_runtime_data}.py`.
New frontend: `frontend/src/pages/{Fleet,AssetDetail}.jsx`.
Commits: `b610a8e` → `d48a47b` (8 commits, pushed to `main`).

**Utility:** `scripts/reset_runtime_data.py` wipes alerts/notifications/inference_log
(keeps users/equipment/sensors/failure_modes) for a clean, fully-stamped start.

---

## 24. Data-Model Expansion — Phases 2 & 3 (Work Orders + Maintenance)

Closes the loop: **anomaly → alert → work order → maintenance record → outcome →
KPIs**. Builds on Section 23. Additive; ML pipeline untouched.

### Phase 2 — `work_orders`
The actionable task spawned by an alert.

**Table** (`app/models/work_order.py`): `id, alert_id (FK), equipment_id (FK),
title, description, priority (AlertSeverity), status, assigned_to (FK users),
created_by (FK users), due_date, created_at, completed_at`.
Lifecycle `open → in_progress → completed | cancelled` (`VALID_TRANSITIONS`).

**Auto-spawn (Decision E, no dedup):** `decision_service.handle_snapshot` creates
one OPEN work order per **HIGH/CRITICAL** alert, pre-filled from the alert +
matched failure mode. Wrapped in try/except so it can never break the alert flow.

**RBAC (Decision G):** admin creates/assigns; assigned technician/operator (or
admin) advance status; list/view role-scoped.

**API:** `POST /work-orders` (admin), `GET /work-orders` (+`?status`,`?equipment_id`),
`GET /{id}`, `PUT /{id}/status`, `PUT /{id}/assign`, `POST /{id}/complete` (Phase 3).

**Frontend:** `pages/WorkOrders.jsx` (stat cards, filters, lifecycle actions,
assign/create modals, asset chip); Work Orders section on `AssetDetail.jsx`.

### Phase 3 — `maintenance_records`
The completed-work log + the **outcome feedback** that grades the AI.

**Table** (`app/models/maintenance_record.py`): `id, work_order_id (FK),
equipment_id (FK), performed_by (FK users), maintenance_type
(corrective|preventive|inspection), action_taken, outcome
(failure_confirmed|no_fault_found|partial|inconclusive), started_at,
completed_at, downtime_minutes, labor_cost, notes`.

**Complete = mandatory log (Decision: atomic).** `POST /work-orders/{id}/complete`
creates the maintenance record AND marks the WO completed in one transaction.
`work_order_service.update_status` now **blocks bare `→ completed`** — completion
must go through `/complete`, so every closed job carries an outcome.

**Feedback / precision (Decision H):** `GET /maintenance-records/stats` →
**production precision = failure_confirmed / (failure_confirmed + no_fault_found)**
(confirmed = AI true positive; no_fault = false positive) + avg downtime (MTTR).

**RBAC:** technician + operator (and admin) log/complete.

**API:** `POST /maintenance-records`, `GET /maintenance-records` (role-scoped),
`GET /maintenance-records/stats`, `GET /{id}`.

**Frontend:** `pages/Maintenance.jsx` (KPI header: AI precision, TP/FP, MTTR,
records + records list); WorkOrders "Complete & Log" modal (action + outcome).

### Utility
`scripts/reset_runtime_data.py` wipes the full operational slate
(maintenance_records + work_orders + alerts + notifications + inference_log,
FK-safe); keeps users/equipment/sensors/failure_modes.

### Commits
Phase 2 `c801509`(+`3c8678b` fe) · Phase 3 `2b766ec`(+`ecddc4b` fe). All on `main`.

---

## 25. Data-Model Expansion — Phase 4 (Spare Parts / MRO Inventory)

Final phase. Adds the parts catalog and links it to maintenance, so completing
a work order consumes parts and decrements stock. Additive; ML pipeline untouched.
**This completes the 6-table asset-centric data-model expansion.**

### Tables
- **`spare_parts`** (`app/models/spare_part.py`): `id, part_name, part_number
  (unique), quantity_in_stock, min_stock_level, location, unit_cost, equipment_id
  (FK, nullable = generic)`. Seeded 6 parts (idempotent on startup).
- **`maintenance_parts`** (`app/models/maintenance_part.py`, Decision D join):
  `id, maintenance_record_id (FK), spare_part_id (FK), quantity_used`.

### Consumption flow
`POST /work-orders/{id}/complete` accepts optional `parts_used:
[{spare_part_id, quantity}]`. In the SAME transaction as the maintenance record:
create `maintenance_parts` rows + **decrement stock, floored at 0** (Decision:
allow + floor — never block a completion over inventory). The maintenance-record
response lists parts consumed (`MaintenanceRecord.parts` relationship).

### Low stock
Computed flag `low_stock = quantity_in_stock <= min_stock_level` on the response.
**No notification** — notifications stay reserved for ML alerts (per request);
low stock is surfaced visually (LOW badge + low-stock count) in the UI.

### API (RBAC: admin writes, any-auth reads)
`POST /spare-parts`, `GET /spare-parts` (+`?low_stock=true`), `GET /{id}`,
`PUT /{id}` (restock/edit).

### Frontend (Inventory lives on the Maintenance page — no new nav tab)
- Maintenance page: **Inventory** section (stock cards + bar, LOW badge,
  low-stock count, admin Restock modal); records show the **Parts** consumed.
- Work Orders "Complete & Log" modal: **Parts Used** picker (part + quantity).

### Files / commits
New: `app/models/{spare_part,maintenance_part}.py`,
`app/schemas/spare_part_schema.py`, `app/services/spare_part_service.py`,
`app/api/routes/spare_parts.py`. Edited: `maintenance_record` model/schema/service
(parts), `work_orders` complete flow, `main.py`, `reset_runtime_data.py`,
`frontend` (Maintenance, WorkOrders, api.js). Commits `0052dc5` (be) + `f959e4f` (fe).

### Final data model (10 tables)
users · alerts · notifications · inference_log · **equipment · sensors ·
failure_modes · work_orders · maintenance_records · spare_parts (+ maintenance_parts join)**.

---

## 26. Novel Failure Capture (Feedback Loop)

When the IF flags an anomaly but the supervised classifier abstains
(`verdict == "UNKNOWN"`), that "unknown" is a failure pattern the system has never
seen — a future training target, not a dead end. Each one is captured, labelled
with the LSTM localizer's diagnosis. Additive; ML pipeline / engine untouched
(engine stays DB-free). Work-order spawning intentionally out of scope here.

### Table `novel_failure_candidates` (`app/models/novel_failure_candidate.py`)
`id, alert_id (loose, nullable), equipment_id (APU-01), detected_at (server now),
data_timestamp, scenario, anomaly_score, classifier_probability,
classifier_verdict (="UNKNOWN"), fault_type, top_sensors (JSON localizer top-3),
recommended_action, status (new|under_review|confirmed|dismissed, default new)`.
**Dedup:** unique `(data_timestamp, scenario)` + `ON CONFLICT DO NOTHING`,
mirroring `inference_log` (scenario passed from decision_service — a real value is
required since Postgres treats NULLs as distinct). Note: `alert_event` fires once
per severity band, so one F4 episode can yield a couple rows at different
data-times; `get_latest_candidate` (newest-first) drives the card correctly.

### Capture (`app/services/decision_service.py` → `handle_snapshot`)
The single place ML output becomes DB rows. After the existing alert/notification/
work-order flow, **if `classifier.verdict == "UNKNOWN"`** →
`novel_failure_service.create_candidate(db, snap, alert_id, scenario)`, wrapped in
`try/except` + `db.rollback()` so a capture failure can never break the alert flow.

### Service / Schema / Routes
`app/services/novel_failure_service.py` (`create_candidate`, `list_candidates`,
`get_latest_candidate`, `update_status`) · `app/schemas/novel_failure_schema.py`
(`NovelFailureCandidateResponse`, `NovelFailureStatusUpdate`) ·
`app/api/routes/novel_failures.py` (prefix `/novel-failures`): `GET /` (any auth,
`?status=`), `GET /latest` (any auth, card), `PUT /{id}/status` (admin). Registered
in `main.py`; model imported so `create_all` builds the table on startup.

### Frontend (`Dashboard.jsx`)
**LIVE** high-attention "NOVEL FAILURE DETECTED" card (rust/anomaly palette),
positioned **between the Fault Localization panel and the AI-Generated Alerts
feed**. Driven straight off the live snapshot — shows only while a novel failure is
actively detected (`ready && classifier.verdict === 'UNKNOWN' && localization.available
&& replay.scenario !== 'F3'`) and disappears the moment the episode clears. Reads
fault_type, top-3 culprit sensors + error values (`localization.top3`), recommended
action, anomaly score, novelty % straight from the snapshot — no DB poll. Suppressed
on F3 (the KNOWN signature; a classifier flicker can still log an F3 candidate
server-side — the capture stays, correct by design, but is never surfaced on F3).
The `/novel-failures` endpoints remain the persistence/triage layer for the captured
candidates (the learning log); the card itself no longer reads them.

---

*Last updated: 2026-06-24*
