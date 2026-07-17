-- BE-140 notification inbox and dispatch foundation.
-- Preferences remain in user_notification_preferences (BE-125).
-- Dispatch jobs reuse outbox_events (topics: notification.dispatch, email.send).

CREATE TABLE notifications (
    id                 text        PRIMARY KEY,
    recipient_user_id  text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_type        text,
    tenant_id          text,
    surface            text        NOT NULL DEFAULT 'SELLER',
    event_code         text        NOT NULL,
    title              text        NOT NULL,
    body               text        NOT NULL DEFAULT '',
    cta_path           text        NOT NULL DEFAULT '',
    content_version    text        NOT NULL,
    priority           text        NOT NULL DEFAULT 'INFO',
    retention_class    text        NOT NULL DEFAULT 'STANDARD',
    read_at            timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notifications_surface_check
        CHECK (surface IN ('SELLER', 'BUYER', 'ADMIN')),
    CONSTRAINT notifications_event_check
        CHECK (event_code IN (
            'SECURITY_ALERT',
            'PAYMENT_RECEIPT',
            'KYC_UPDATE',
            'WITHDRAWAL_UPDATE',
            'MARKETING_NEWSLETTER'
        )),
    CONSTRAINT notifications_priority_check
        CHECK (priority IN ('INFO', 'WARNING', 'CRITICAL', 'COMPLIANCE')),
    CONSTRAINT notifications_retention_check
        CHECK (retention_class IN ('STANDARD', 'SECURITY', 'COMPLIANCE')),
    CONSTRAINT notifications_title_nonempty CHECK (title <> ''),
    CONSTRAINT notifications_content_version_nonempty CHECK (content_version <> ''),
    CONSTRAINT notifications_tenant_pair_check
        CHECK (
            (tenant_type IS NULL AND tenant_id IS NULL)
            OR (tenant_type IS NOT NULL AND tenant_id IS NOT NULL)
        )
);

-- Dedupe: one inbox row per recipient + event + content_version.
CREATE UNIQUE INDEX notifications_dedupe_uidx
    ON notifications (recipient_user_id, event_code, content_version);

CREATE INDEX notifications_recipient_created_idx
    ON notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX notifications_recipient_unread_idx
    ON notifications (recipient_user_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;

-- Channel delivery attempts (email etc.). Inbox row stays even if channel fails.
CREATE TABLE notification_delivery_attempts (
    id               text        PRIMARY KEY,
    notification_id  text        NOT NULL REFERENCES notifications (id) ON DELETE CASCADE,
    outbox_id        text        REFERENCES outbox_events (id) ON DELETE SET NULL,
    channel          text        NOT NULL,
    status           text        NOT NULL DEFAULT 'PENDING',
    attempts         integer     NOT NULL DEFAULT 0,
    last_error       text,
    provider_ref     text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    completed_at     timestamptz,
    CONSTRAINT notification_delivery_attempts_channel_check
        CHECK (channel IN ('EMAIL', 'IN_APP')),
    CONSTRAINT notification_delivery_attempts_status_check
        CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SUPPRESSED', 'SKIPPED')),
    CONSTRAINT notification_delivery_attempts_attempts_check
        CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX notification_delivery_attempts_notif_channel_uidx
    ON notification_delivery_attempts (notification_id, channel);

CREATE INDEX notification_delivery_attempts_status_idx
    ON notification_delivery_attempts (status, updated_at)
    WHERE status IN ('PENDING', 'PROCESSING', 'FAILED');

-- Bounce / suppression list (optional channel mute; never blocks mandatory inbox).
CREATE TABLE notification_suppressions (
    id               text        PRIMARY KEY,
    user_id          text        REFERENCES users (id) ON DELETE CASCADE,
    email_normalized text,
    channel          text        NOT NULL,
    reason           text        NOT NULL DEFAULT 'BOUNCE',
    event_code       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz,
    CONSTRAINT notification_suppressions_channel_check
        CHECK (channel IN ('EMAIL', 'IN_APP')),
    CONSTRAINT notification_suppressions_reason_check
        CHECK (reason IN ('BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE', 'MANUAL')),
    CONSTRAINT notification_suppressions_target_check
        CHECK (user_id IS NOT NULL OR email_normalized IS NOT NULL)
);

CREATE UNIQUE INDEX notification_suppressions_user_channel_event_uidx
    ON notification_suppressions (user_id, channel, COALESCE(event_code, ''))
    WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX notification_suppressions_email_channel_uidx
    ON notification_suppressions (email_normalized, channel)
    WHERE email_normalized IS NOT NULL AND event_code IS NULL;

CREATE INDEX notification_suppressions_email_idx
    ON notification_suppressions (email_normalized)
    WHERE email_normalized IS NOT NULL;

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('notifications', 'BE-140', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
