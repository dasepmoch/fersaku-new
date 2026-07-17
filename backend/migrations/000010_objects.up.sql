-- BE-220 R2 object/upload/delivery foundation.
-- object_refs authority is PostgreSQL; R2/MinIO holds bytes only.
-- Server-generated create-only keys; never accept client-chosen keys as authority.
-- KYC never uses this browser-presigned path (BE-400 server-mediated stream).

-- ---------------------------------------------------------------------------
-- object_refs
-- ---------------------------------------------------------------------------
CREATE TABLE object_refs (
    id                      text        PRIMARY KEY,
    bucket                  text        NOT NULL,
    object_key              text        NOT NULL,
    purpose                 text        NOT NULL,
    visibility              text        NOT NULL,
    content_type            text        NOT NULL,
    expected_size_bytes     bigint      NOT NULL,
    actual_size_bytes       bigint,
    checksum_sha256         text,
    expected_checksum_sha256 text,
    encryption_key_version  text,
    retention_class         text        NOT NULL DEFAULT 'STANDARD',
    owner_merchant_id       text        NOT NULL REFERENCES merchants (id),
    owner_store_id          text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    owner_user_id           text        REFERENCES users (id),
    status                  text        NOT NULL DEFAULT 'UPLOADING',
    upload_expires_at       timestamptz NOT NULL,
    multipart_upload_id     text,
    multipart_aborted_at    timestamptz,
    scan_status             text,
    scan_verdict            text,
    scan_version            text,
    scan_at                 timestamptz,
    last_verified_at        timestamptz,
    rejected_reason         text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT object_refs_bucket_nonempty CHECK (bucket <> ''),
    CONSTRAINT object_refs_key_nonempty CHECK (object_key <> ''),
    CONSTRAINT object_refs_purpose_check CHECK (purpose IN (
        'PRODUCT_FILE',
        'PUBLIC_ASSET',
        'PROFILE_ASSET',
        'INVOICE_INPUT'
    )),
    CONSTRAINT object_refs_visibility_check CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
    CONSTRAINT object_refs_status_check CHECK (status IN (
        'UPLOADING',
        'SCANNING',
        'READY',
        'REJECTED',
        'EXPIRED'
    )),
    CONSTRAINT object_refs_retention_check CHECK (retention_class IN (
        'STANDARD',
        'PRODUCT',
        'AUDIT_LOCKED',
        'KYC_CIPHERTEXT'
    )),
    CONSTRAINT object_refs_size_pos CHECK (expected_size_bytes > 0),
    CONSTRAINT object_refs_actual_size_nonneg CHECK (actual_size_bytes IS NULL OR actual_size_bytes >= 0),
    -- KYC purpose is forbidden on this table path; reserved for BE-400.
    CONSTRAINT object_refs_no_kyc_purpose CHECK (purpose <> 'KYC_DOCUMENT')
);

CREATE UNIQUE INDEX object_refs_bucket_key_uidx ON object_refs (bucket, object_key);
CREATE INDEX object_refs_store_status_idx ON object_refs (owner_store_id, status);
CREATE INDEX object_refs_merchant_status_idx ON object_refs (owner_merchant_id, status);
CREATE INDEX object_refs_uploading_expiry_idx ON object_refs (status, upload_expires_at)
    WHERE status = 'UPLOADING';
CREATE INDEX object_refs_owner_user_idx ON object_refs (owner_user_id)
    WHERE owner_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- object_delivery_grants (BE-220 stub for buyer short-lived download; BE-235 expands)
-- ---------------------------------------------------------------------------
CREATE TABLE object_delivery_grants (
    id              text        PRIMARY KEY,
    object_id       text        NOT NULL REFERENCES object_refs (id) ON DELETE CASCADE,
    store_id        text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    grantee_user_id text        NOT NULL REFERENCES users (id),
    purpose         text        NOT NULL DEFAULT 'BUYER_DELIVERY',
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz,
    max_uses        integer     NOT NULL DEFAULT 10,
    use_count       integer     NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT object_delivery_grants_purpose_check CHECK (purpose IN ('BUYER_DELIVERY', 'OWNER_PREVIEW')),
    CONSTRAINT object_delivery_grants_max_uses_pos CHECK (max_uses > 0),
    CONSTRAINT object_delivery_grants_use_nonneg CHECK (use_count >= 0)
);

CREATE INDEX object_delivery_grants_object_idx ON object_delivery_grants (object_id);
CREATE INDEX object_delivery_grants_grantee_idx ON object_delivery_grants (grantee_user_id, expires_at)
    WHERE revoked_at IS NULL;

-- Soft quota projection per merchant (bytes of READY objects).
CREATE TABLE object_quota_usage (
    merchant_id     text        PRIMARY KEY REFERENCES merchants (id) ON DELETE CASCADE,
    ready_bytes     bigint      NOT NULL DEFAULT 0,
    object_count    bigint      NOT NULL DEFAULT 0,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT object_quota_usage_bytes_nonneg CHECK (ready_bytes >= 0),
    CONSTRAINT object_quota_usage_count_nonneg CHECK (object_count >= 0)
);
