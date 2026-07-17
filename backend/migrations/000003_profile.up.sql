-- BE-125 account profile, dual email-change, notification preferences.

-- Extend challenge purposes for dual email-change proofs.
ALTER TABLE auth_challenges DROP CONSTRAINT auth_challenges_purpose_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_purpose_check
    CHECK (purpose IN (
        'EMAIL_VERIFY',
        'PASSWORD_RESET',
        'MAGIC_LINK',
        'MFA_ENROLL',
        'EMAIL_CHANGE_CURRENT',
        'EMAIL_CHANGE_NEW'
    ));

CREATE TABLE user_profiles (
    user_id      text        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    display_name text        NOT NULL DEFAULT '',
    phone        text        NOT NULL DEFAULT '',
    locale       text        NOT NULL DEFAULT 'id-ID',
    timezone     text        NOT NULL DEFAULT 'Asia/Jakarta',
    avatar_ref   text        NOT NULL DEFAULT '',
    version      bigint      NOT NULL DEFAULT 1,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_profiles_version_check CHECK (version >= 1),
    CONSTRAINT user_profiles_locale_nonempty CHECK (locale <> ''),
    CONSTRAINT user_profiles_timezone_nonempty CHECK (timezone <> '')
);

CREATE TABLE email_change_requests (
    id                        text        PRIMARY KEY,
    user_id                   text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    new_email_normalized      text        NOT NULL,
    new_email_display         text        NOT NULL,
    current_proof_challenge_id text       NOT NULL REFERENCES auth_challenges (id),
    new_proof_challenge_id    text        NOT NULL REFERENCES auth_challenges (id),
    current_confirmed_at      timestamptz,
    new_confirmed_at          timestamptz,
    status                    text        NOT NULL DEFAULT 'PENDING',
    created_at                timestamptz NOT NULL DEFAULT now(),
    completed_at              timestamptz,
    CONSTRAINT email_change_requests_status_check
        CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT email_change_requests_new_email_nonempty
        CHECK (new_email_normalized <> '')
);

CREATE UNIQUE INDEX email_change_requests_user_pending_uidx
    ON email_change_requests (user_id)
    WHERE status = 'PENDING';

CREATE INDEX email_change_requests_new_email_pending_idx
    ON email_change_requests (new_email_normalized)
    WHERE status = 'PENDING';

-- Closed event/channel matrix. Mandatory rows cannot be disabled by app policy
-- even if a client attempts to set enabled=false.
CREATE TABLE user_notification_preferences (
    user_id    text        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_code text        NOT NULL,
    channel    text        NOT NULL,
    enabled    boolean     NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, event_code, channel),
    CONSTRAINT user_notification_preferences_event_check
        CHECK (event_code IN (
            'SECURITY_ALERT',
            'PAYMENT_RECEIPT',
            'KYC_UPDATE',
            'WITHDRAWAL_UPDATE',
            'MARKETING_NEWSLETTER'
        )),
    CONSTRAINT user_notification_preferences_channel_check
        CHECK (channel IN ('EMAIL', 'IN_APP'))
);

CREATE INDEX user_notification_preferences_user_idx
    ON user_notification_preferences (user_id);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('profile', 'BE-125', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
