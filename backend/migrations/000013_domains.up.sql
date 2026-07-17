-- BE-240 Store custom-domain lifecycle.
-- Global hostname claims, DNS verification, edge/TLS projection, takeover cooldown.

CREATE TABLE store_domains (
    id                       text        PRIMARY KEY,
    store_id                 text        NOT NULL REFERENCES stores (id),
    merchant_id              text        NOT NULL REFERENCES merchants (id),
    hostname_normalized      text        NOT NULL,
    hostname_display         text        NOT NULL,
    status                   text        NOT NULL DEFAULT 'PENDING_DNS',
    verification_token_hash  text        NOT NULL,
    expected_dns_name        text        NOT NULL,
    expected_dns_value       text        NOT NULL DEFAULT '',
    version                  integer     NOT NULL DEFAULT 1,
    tls_status               text        NOT NULL DEFAULT 'NONE',
    failure_code             text,
    last_checked_at          timestamptz,
    next_check_at            timestamptz,
    verified_at              timestamptz,
    edge_provisioned_at      timestamptz,
    edge_removed_at          timestamptz,
    cooldown_until           timestamptz,
    suspended_at             timestamptz,
    removing_at              timestamptz,
    tombstoned_at            timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT store_domains_hostname_nonempty CHECK (
        hostname_normalized <> '' AND hostname_display <> ''
    ),
    CONSTRAINT store_domains_status_check CHECK (status IN (
        'PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED',
        'SUSPENDED', 'REMOVING', 'TOMBSTONED'
    )),
    CONSTRAINT store_domains_tls_status_check CHECK (tls_status IN (
        'NONE', 'PENDING', 'ACTIVE', 'FAILED', 'REMOVING', 'REMOVED'
    )),
    CONSTRAINT store_domains_version_pos CHECK (version > 0),
    CONSTRAINT store_domains_token_hash_nonempty CHECK (verification_token_hash <> ''),
    CONSTRAINT store_domains_dns_name_nonempty CHECK (expected_dns_name <> '')
);

-- Globally unique active claims (including tombstone cooldown window).
CREATE UNIQUE INDEX store_domains_hostname_claim_uidx
    ON store_domains (hostname_normalized)
    WHERE status IN (
        'PENDING_DNS', 'VERIFYING', 'ACTIVE', 'FAILED',
        'SUSPENDED', 'REMOVING', 'TOMBSTONED'
    );

CREATE INDEX store_domains_store_created_idx
    ON store_domains (store_id, created_at DESC, id DESC);

CREATE INDEX store_domains_merchant_idx
    ON store_domains (merchant_id);

CREATE INDEX store_domains_status_next_check_idx
    ON store_domains (status, next_check_at)
    WHERE status IN ('ACTIVE', 'SUSPENDED', 'VERIFYING', 'REMOVING');

CREATE INDEX store_domains_tombstone_cooldown_idx
    ON store_domains (cooldown_until)
    WHERE status = 'TOMBSTONED';

-- Authoritative public Host → store resolution (ACTIVE only).
CREATE UNIQUE INDEX store_domains_active_hostname_uidx
    ON store_domains (hostname_normalized)
    WHERE status = 'ACTIVE';
