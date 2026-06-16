-- ==========================================================================
-- Predictive Maintenance — Database Schema Reference
-- ==========================================================================

-- ── Enum Types ───────────────────────────────────────────────────────

CREATE TYPE userrole AS ENUM ('admin', 'technician', 'operator');
CREATE TYPE alertseverity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE alertstatus AS ENUM ('new', 'acknowledged', 'resolved');
CREATE TYPE recipienttype AS ENUM ('user', 'group', 'all');
CREATE TYPE notificationtype AS ENUM ('alert', 'system', 'broadcast');


-- ── Users ────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(50)     NOT NULL,
    email           VARCHAR(120)    NOT NULL,
    password_hash   VARCHAR(256)    NOT NULL,
    role            userrole        NOT NULL DEFAULT 'operator',
    created_at      TIMESTAMP       NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ix_users_username ON users (username);
CREATE UNIQUE INDEX ix_users_email    ON users (email);


-- ── Alerts ───────────────────────────────────────────────────────────

CREATE TABLE alerts (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    severity            alertseverity   NOT NULL DEFAULT 'medium',
    "timestamp"         TIMESTAMP       NOT NULL DEFAULT now(),
    predicted_failure   VARCHAR(255)    NOT NULL,
    recommended_action  TEXT            NOT NULL,
    status              alertstatus     NOT NULL DEFAULT 'new',
    assigned_to         UUID            REFERENCES users(id),
    anomaly_score       FLOAT,
    created_by          VARCHAR(100)    NOT NULL DEFAULT 'system'
);


-- ── Notifications ────────────────────────────────────────────────────

CREATE TABLE notifications (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    subject         VARCHAR(200)        NOT NULL,
    body            TEXT                NOT NULL,

    -- Targeting
    recipient_type  recipienttype       NOT NULL,
    recipient_id    UUID                REFERENCES users(id),
    target_role     VARCHAR(50),

    -- Metadata
    created_by      UUID                NOT NULL REFERENCES users(id),
    "timestamp"     TIMESTAMP           NOT NULL DEFAULT now(),
    is_read         BOOLEAN             NOT NULL DEFAULT FALSE,

    -- Classification & linking
    type            notificationtype    NOT NULL DEFAULT 'system',
    alert_id        UUID                REFERENCES alerts(id)
);
