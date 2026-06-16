# Handoff: Auguard PdM — Frontend Implementation

> **For Claude Code:** These HTML files are **high-fidelity design references** — prototypes showing
> exact look, layout, and behaviour. Your task is to **recreate them as a React (Vite) app** inside
> the existing `Full-Project/` repo, wired to the FastAPI backend. Do not ship the HTML files
> directly; use them as your pixel-perfect specification.

---

## 1. Project Context

**Product:** Auguard — AI predictive maintenance dashboard for the Porto Metro APU air-compressor
fleet (SmartMetro graduation project).

**Backend:** FastAPI (`app/`) running on `http://localhost:8000`. PostgreSQL DB. JWT auth with
three roles: `admin`, `technician`, `operator`.

**Frontend to create:** `frontend/` folder at the repo root. Stack specified in `SMARTMETRO_PLAN.md`:

```
React (Vite) + Recharts + plain fetch polling (every 1.5 s)
No Redux. No websockets (polling is fine for a demo).
```

**CORS:** Add `CORSMiddleware` to `app/main.py` for `http://localhost:5173` (Vite default).

---

## 2. Fidelity

**High-fidelity.** Pixel-perfect recreation expected. Every color hex, font weight, border-radius,
spacing value, and animation listed in this document comes directly from the design files. Use the
values as written — do not substitute design-system defaults.

To preview the designs, open any `.dc.html` file in a browser (they are standalone HTML files).
Keep `support.js` in the same folder.

---

## 3. Design Tokens

### 3.1 Color palette

```js
// Background layers
bg-base:       '#1B2027'   // page background
bg-surface:    '#222831'   // card / panel background
bg-elevated:   '#2a3140'   // modals, dropdowns
bg-section:    '#1e242d'   // alternating section bg (Landing)

// Borders
border-subtle: '#2f3742'
border-strong: '#333b45'
border-accent: '#393E46'

// Text
text-primary:  '#DFD0B8'   // headings, primary labels
text-secondary:'#a59c8c'   // body copy
text-muted:    '#948979'   // section labels, subtitles
text-dim:      '#7c756a'   // timestamps, meta
text-faint:    '#6f6a60'   // placeholder, footer

// Status — Normal (olive/green)
status-normal-bg:     'rgba(123,138,67,.14)'
status-normal-border: 'rgba(123,138,67,.32)'
status-normal-text:   '#C6D196'
status-normal-dot:    '#AEBC74'

// Status — Warning / Drift (ochre)
status-warn-bg:       'rgba(217,169,74,.14)'
status-warn-border:   'rgba(217,169,74,.40)'
status-warn-text:     '#E4C281'

// Status — Critical / Anomaly (rust)
status-crit-bg:       'rgba(203,91,60,.16)'
status-crit-border:   'rgba(203,91,60,.45)'
status-crit-text:     '#E0987F'
status-crit-solid:    '#CB5B3C'

// Accent (buttons, CTAs)
accent-light:  '#DFD0B8'   // primary CTA background
accent-mid:    '#cabfa6'
accent-warm:   '#948979'
```

### 3.2 Typography

```css
/* Headings — h1 through h5, large display text */
font-family: 'Neue Haas Grotesk Display Pro', 'Neue Haas Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif;

/* Body, nav links, buttons, labels, inputs */
font-family: 'Satoshi', system-ui, sans-serif;
```

Load Satoshi from Fontshare — include in `index.html`:
```html
<link rel="preconnect" href="https://api.fontshare.com">
<link href="https://api.fontshare.com/v2/css?f[]=satoshi@700,500,400&display=swap" rel="stylesheet">
```

Neue Haas Grotesk has no free CDN — it falls back to Helvetica Neue which is visually equivalent.
If you have the font licensed, self-serve it from `public/fonts/`.

### 3.3 Type scale

| Usage                | Size      | Weight | Font          |
|----------------------|-----------|--------|---------------|
| Hero h1              | clamp(42px,6.4vw,82px) | 800 | NHG |
| Section h2           | clamp(28px,3.6vw,46px) | 700 | NHG |
| Card h2              | clamp(26px,3vw,40px)   | 700 | NHG |
| Card h3              | 17–19 px  | 600    | NHG           |
| Nav brand name       | 16 px     | 700    | Satoshi       |
| Nav links            | 13 px     | 500    | Satoshi       |
| Body paragraph       | 14–15 px  | 400    | Satoshi       |
| Section eyebrow      | 12 px     | 600    | Satoshi       |
| Micro labels / badge | 11–11.5 px| 600–700| Satoshi       |

### 3.4 Spacing & radii

```
Page max-width:  1200 px (Landing), 1400 px (Dashboard/Alerts/Notifications/Users)
Page padding:    0 30 px (Landing), 0 26–28 px (app pages)
Section padding: 120–130 px top/bottom

Card border-radius: 16 px (standard), 20 px (featured), 9–11 px (buttons), 8 px (nav chips)
Input border-radius: 10 px
Avatar border-radius: 50%

Topbar height:   58–66 px (sticky, blur backdrop)
Gap — grid cards: 18–22 px
Gap — flex rows:  12–14 px
```

### 3.5 Shadows & effects

```css
/* Featured card */
box-shadow: 0 30px 70px rgba(0,0,0,.35);

/* Auth modal */
box-shadow: 0 40px 90px rgba(0,0,0,.5);

/* Topbar background */
background: rgba(27,32,39,.93);
backdrop-filter: blur(12px);
```

---

## 4. Screens

### 4.1 Landing (`Landing.dc.html`)

Public marketing page. No auth required.

**Sections (top → bottom):**

1. **Nav** — Fixed, blur backdrop. Logo (`A` monogram + "Auguard · PdM"), links: *How it works /
   Live demo / Fault locator / Team*, CTA button "Sign in" → `/auth`.
2. **Hero** — Full-viewport. Animated 3D grid canvas background (perspectived sine-wave mesh,
   golden highlight row sweeping). Left-aligned headline "Predict the failure before it happens."
   Two CTAs: "Get started" (solid `#DFD0B8`) + "See it live" (ghost).
3. **Problem** — 3-column grid of cards: *Unplanned downtime / Hidden warning signs / Costly reactive repairs*.
4. **How it works** — 3-column: step 01 Sense → 02 Detect → 03 Act, each with numbered rule,
   icon in tinted box, title + description.
5. **Live Demo** — Left: live anomaly score canvas chart (Isolation Forest score vs 0.65 threshold,
   auto-animating, status badge syncs NORMAL / DRIFT / ANOMALY). Right: copy + "99.5% of failures caught" callout.
6. **Fault Locator** — Left: sensor blame bars (TP2, H1, DV Pressure) with score values. Right:
   SVG diagram of APU unit with pulsing critical nodes.
7. **Roles** — 3-column: Admin / Technician / Operator.
8. **Team** — 4-column grid of 8 team member cards (initials avatar, name, "SmartMetro Team").
9. **Footer CTA** — "Stop reacting to breakdowns. Start predicting them." + two buttons.

---

### 4.2 Auth (`Auth.dc.html`)

Split-panel layout. `grid-template-columns: 1fr 1fr`. Max-width 1040 px, centered.

**Left panel (brand):**
- Logo + brand name
- h1: "Catch air-compressor failures before they happen."
- Body: description + 3 bullet points (Isolation Forest 99.5%, LSTM-AE fault localization,
  LightGBM RUL MAE ±21.6h) with colored glowing dots
- Footer: MetroPT-3 dataset credit

**Right panel (form):**
- Tab switcher: *Sign in / Register* (toggle between two forms)
- Sign-in form: Username + Password inputs, "Sign in" button, spinner on submit
- Register form: Username + Email + Password + Role select (admin/technician/operator)
- Error state: red message box under form
- Success: brief check animation then redirect

**API calls:**
```
POST /auth/login      { username, password }  → { access_token, token_type }
POST /auth/register   { username, email, password, role }  → UserResponse
```

**On success:** store JWT in `localStorage` as `auguard_token`. Store decoded role as
`auguard_role`. Redirect admin/operator → `/dashboard`, technician → `/alerts`.

---

### 4.3 Dashboard (`Dashboard.dc.html`)

Main live monitoring screen. Requires auth (any role).

**Topbar (sticky, 58 px):**
- Left: Logo + divider + nav tabs (Dashboard **active** / Alerts / Notifications / Users)
- Right: LIVE badge (blinking red dot) + notification bell with unread count + user avatar pill
  (initials, username, role badge)

**Main content (max-width 1400 px, padding 26 px):**

Layout is a responsive grid. Key panels:

| Panel | Content |
|---|---|
| **Anomaly Score** (live chart) | Line chart of IF score vs time, threshold dashed line at 0.65, status badge NORMAL/DRIFT/ANOMALY, model version label |
| **RUL Forecast** | Hours remaining (0–168 h), progress bar, MAE ±21.6 h footnote |
| **Fault Localization** | Top-3 culprit sensors with contribution bars + fault type chip + recommended action |
| **Sensor Readings** | Grid of current readings for TP2, TP3, H1, DV_pressure, Reservoirs, Oil_temperature, Motor_current (analog) + COMP, DV_eletric, Towers, MPG, LPS, Pressure_switch, Oil_level, Caudal_impulses (digital) |
| **Recent Alerts** | Last 5 alerts, severity badge, status, predicted failure label, timestamp |

**Polling:** `GET /dashboard` every 1.5 s. Update chart buffer (keep last 90 points). Check
anomaly score against threshold to sync status badge colours.

**Score colours:**
- `score < 0.50` → olive/normal
- `0.50 ≤ score < 0.65` → ochre/drift
- `score ≥ 0.65` → rust/anomaly

**API calls:**
```
GET  /dashboard           → AnomalyDetectionResponse  (poll 1.5 s)
GET  /alerts?status=new   → AlertResponse[]            (poll 5 s, show 5 most recent)
GET  /notifications       → NotificationResponse[]     (poll 10 s, unread count in badge)
```

---

### 4.4 Alerts (`Alerts.dc.html`)

Alert management table. Requires auth.

**Topbar:** identical to Dashboard, "Alerts" tab active.

**Filter bar:**
- Status filter chips: All / New / Acknowledged / Resolved
- Severity filter chips: All / Low / Medium / High / Critical
- Search input (filter by predicted_failure text)

**Table columns:** Severity badge | Predicted Failure | Anomaly Score | Assigned To | Status |
Created At | Actions

**Severity badge colours:**
- low → olive `#AEBC74`
- medium → ochre `#E4C281`
- high → rust `#E0987F`
- critical → rust solid `#CB5B3C` + pulse animation

**Row actions (role-gated):**
- **Admin:** Assign (opens user picker modal) + Escalate (→ critical) + view detail
- **Technician / Operator:** Acknowledge (NEW → ACKNOWLEDGED) + Resolve (ACKNOWLEDGED → RESOLVED)

**Create Alert modal (admin only):** form with severity select, predicted_failure text,
recommended_action textarea, assigned_to user select, anomaly_score number.

**API calls:**
```
GET    /alerts                          → AlertResponse[]
GET    /alerts?status=...&severity=...  → filtered list
GET    /alerts/{id}                     → AlertResponse
POST   /alerts                          body: AlertCreate
PUT    /alerts/{id}/assign              body: { assigned_to: UUID }
PUT    /alerts/{id}/status              body: { status: "acknowledged"|"resolved" }
PUT    /alerts/{id}/escalate            (no body)
```

---

### 4.5 Notifications (`Notifications.dc.html`)

Notification center. Requires auth.

**Topbar:** "Notifications" tab active.

**Layout:** two-column — left sidebar (compose + filters), right main list.

**Notification list items:**
- Icon (type: system / alert / general)
- Subject (bold if unread) + body excerpt
- Timestamp
- Mark-as-read button (click row or explicit button)
- Linked alert chip (if `type === 'alert'` and `alert_id` present)

**Compose panel (admin only):**
- Subject + body inputs
- Recipient type: User / Group / All (radio)
  - User → show user select
  - Group → show role select (admin/technician/operator)
  - All → no extra field
- Type: system / alert / general
  - If alert → show alert ID input

**Unread count badge:** count of items where `is_read === false`.

**API calls:**
```
GET  /notifications             → NotificationResponse[]
PUT  /notifications/{id}/read   → NotificationResponse
POST /notifications             body: NotificationCreate  (admin)
```

---

### 4.6 Users (`Users.dc.html`)

User management. Admin only — redirect non-admins to `/dashboard`.

**Layout:** single full-width table + right side panel for create/edit.

**Table columns:** Avatar (initials) | Username | Email | Role badge | Created At | Actions

**Role badge colours:**
- admin → rust `#E0987F`
- technician → ochre `#E4C281`
- operator → olive `#C6D196`

**Actions:** View detail (side panel) | (no delete in current backend — omit or grey out)

**Create user panel (right slide-in):**
- Username + Email + Password + Role select
- Submit → POST /auth/register

**API calls:**
```
GET   /auth/users    → UserResponse[]   (admin only)
POST  /auth/register body: UserCreate
```

---

## 5. Authentication & Routing

```
Public routes:    /  (Landing)    /auth  (Login/Register)
Protected routes: /dashboard      /alerts    /notifications    /users
```

**Route guard:** On protected route mount, check `localStorage.auguard_token`. If missing →
redirect to `/auth`. If present, decode JWT to get `role` and enforce role gates:
- `/users` → admin only → redirect others to `/dashboard`
- All other protected routes → any authenticated role

**JWT header:** `Authorization: Bearer <token>` on every API call.

**Token storage key:** `auguard_token`
**Role storage key:** `auguard_role`

---

## 6. Interactions & Animations

### Nav
- On scroll > 40 px: topbar background transitions from `transparent` to `rgba(27,32,39,.86)`,
  border becomes visible. Use `transition: background 0.3s, border-color 0.3s`.

### Scroll reveals (Landing)
- Elements with `[data-reveal]` start `opacity: 0; transform: translateY(30px)`.
- When 90% of viewport height is reached, transition to `opacity:1; transform:none`.
- Duration 0.7 s, easing `cubic-bezier(.16,1,.3,1)`.

### Anomaly chart (Dashboard canvas)
- Maintain a rolling buffer of 90 score points.
- New point appended every ~50 ms (simulated) or every API poll.
- Area fill gradient matches current zone colour (olive/ochre/rust).
- Threshold dashed line at y = 0.65.
- Head dot: outer glow circle + solid inner dot at current position.

### Status badge
- NORMAL → olive bg/text
- DRIFT → ochre bg/text
- ANOMALY → rust bg/text + `animation: pulse 1.9s infinite` on the badge border

### Severity pulse (critical alerts)
```css
@keyframes scpulse {
  0%   { box-shadow: 0 0 0 0 rgba(203,91,60,.5); }
  70%  { box-shadow: 0 0 0 12px rgba(203,91,60,0); }
  100% { box-shadow: 0 0 0 0 rgba(203,91,60,0); }
}
```

### Toast notifications
- Slide in from right: `from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) }`
- Auto-dismiss after 4 s

### Form submit spinner
```css
@keyframes scspin { to { transform: rotate(360deg) } }
```
20 px circle, 2 px border, top border coloured, rest transparent.

### Page transitions
- Cards + table rows fade in on load: `from { opacity:0; transform:translateY(10px) } to { opacity:1 }`
- Duration 0.25 s, stagger 40 ms per item.

---

## 7. State Management

No Redux. Use React context for:

```ts
AuthContext {
  token: string | null
  role: 'admin' | 'technician' | 'operator' | null
  username: string | null
  login(token: string): void
  logout(): void
}
```

Per-page local state with `useState` + `useEffect` for polling. A simple custom hook:

```ts
function usePoll<T>(url: string, intervalMs: number): { data: T | null, error: string | null }
```

---

## 8. API Base URL & Error Handling

```ts
const API = 'http://localhost:8000'

// Wrapper
async function api(path, options = {}) {
  const token = localStorage.getItem('auguard_token')
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) { /* redirect to /auth */ }
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
```

---

## 9. Project Structure (suggested)

```
frontend/
├── index.html          ← load Fontshare Satoshi here
├── vite.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx         ← router + AuthProvider
│   ├── api.js          ← fetch wrapper + all API fns
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── hooks/
│   │   └── usePoll.js
│   ├── pages/
│   │   ├── Landing.jsx
│   │   ├── Auth.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Alerts.jsx
│   │   ├── Notifications.jsx
│   │   └── Users.jsx
│   ├── components/
│   │   ├── Topbar.jsx
│   │   ├── AnomalyChart.jsx   ← Recharts LineChart
│   │   ├── SensorGrid.jsx
│   │   ├── AlertRow.jsx
│   │   ├── StatusBadge.jsx
│   │   └── Toast.jsx
│   └── tokens.js       ← export the color/spacing constants from §3
```

---

## 10. Design Files

| File | Purpose |
|---|---|
| `Landing.dc.html` | Public marketing page |
| `Auth.dc.html` | Login + register |
| `Dashboard.dc.html` | Live monitoring (dark warm theme) |
| `Dashboard Navy.dc.html` | Alternative navy colour scheme — reference only |
| `Alerts.dc.html` | Alert management |
| `Notifications.dc.html` | Notification center |
| `Users.dc.html` | User management (admin) |

Open any file directly in a browser to preview. `support.js` must be in the same folder.

---

## 11. Backend Setup Reminder (for completeness)

```bash
# From repo root
cd app
pip install -r requirements.txt
# Add to app/main.py:
# from fastapi.middleware.cors import CORSMiddleware
# app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"],
#                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
uvicorn app.main:app --reload
```

See `SMARTMETRO_PLAN.md` in the repo root for the full backend integration roadmap (ML models,
simulation service, auto-alerting).
