-- BE-400 KYC live QRIS API workflow.
-- Cases, encrypted document refs, transition audit, pending LIVE issuance authorization.
-- Full credential claim consumption is BE-410; approval only enables capability + AUTHORIZED issuance.

-- ---------------------------------------------------------------------------
-- kyc_cases
-- ---------------------------------------------------------------------------
CREATE TABLE kyc_cases (
    id                      text        PRIMARY KEY,
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    store_id                text        REFERENCES stores (id),
    capability              text        NOT NULL DEFAULT 'QRIS_API_LIVE',
    status                  text        NOT NULL DEFAULT 'DRAFT',
    version                 integer     NOT NULL DEFAULT 1,
    legal_name              text        NOT NULL DEFAULT '',
    business_name           text        NOT NULL DEFAULT '',
    registration_number     text        NOT NULL DEFAULT '',
    country_code            text        NOT NULL DEFAULT 'ID',
    consent_version         text        NOT NULL DEFAULT '',
    consent_accepted_at     timestamptz,
    reviewer_user_id        text        REFERENCES users (id),
    vendor_ref              text        NOT NULL DEFAULT '',
    reason                  text        NOT NULL DEFAULT '',
    clarification_reason    text        NOT NULL DEFAULT '',
    predecessor_case_id     text        REFERENCES kyc_cases (id),
    submitted_at            timestamptz,
    reviewed_at             timestamptz,
    approved_at             timestamptz,
    rejected_at             timestamptz,
    expires_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kyc_cases_capability_check CHECK (capability = 'QRIS_API_LIVE'),
    CONSTRAINT kyc_cases_status_check CHECK (status IN (
        'DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VENDOR_CHECK',
        'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'EXPIRED'
    )),
    CONSTRAINT kyc_cases_version_pos CHECK (version >= 1)
);

CREATE INDEX kyc_cases_merchant_idx
    ON kyc_cases (merchant_id, created_at DESC, id DESC);

CREATE INDEX kyc_cases_status_queue_idx
    ON kyc_cases (status, submitted_at ASC NULLS LAST, id ASC);

CREATE INDEX kyc_cases_reviewer_idx
    ON kyc_cases (reviewer_user_id)
    WHERE reviewer_user_id IS NOT NULL;

-- At most one non-terminal open case per merchant (resubmit after reject/expire creates successor).
CREATE UNIQUE INDEX kyc_cases_open_merchant_uidx
    ON kyc_cases (merchant_id)
    WHERE status IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'VENDOR_CHECK', 'NEEDS_CLARIFICATION');

-- ---------------------------------------------------------------------------
-- kyc_documents (ciphertext refs only; plaintext never in object storage)
-- ---------------------------------------------------------------------------
CREATE TABLE kyc_documents (
    id                      text        PRIMARY KEY,
    case_id                 text        NOT NULL REFERENCES kyc_cases (id),
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    document_type           text        NOT NULL,
    status                  text        NOT NULL DEFAULT 'PENDING',
    content_type            text        NOT NULL DEFAULT '',
    size_bytes              bigint      NOT NULL DEFAULT 0,
    checksum_sha256         text        NOT NULL DEFAULT '',
    -- Server-generated private R2 key; never returned as reusable browser URL.
    storage_bucket          text        NOT NULL DEFAULT '',
    storage_key             text        NOT NULL DEFAULT '',
    encryption_key_version  text        NOT NULL DEFAULT '',
    ciphertext_size_bytes   bigint      NOT NULL DEFAULT 0,
    scan_status             text        NOT NULL DEFAULT 'PENDING',
    scan_detail             text        NOT NULL DEFAULT '',
    doc_version             integer     NOT NULL DEFAULT 1,
    uploaded_by             text        REFERENCES users (id),
    ready_at                timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kyc_documents_type_check CHECK (document_type IN (
        'ID_FRONT', 'ID_BACK', 'SELFIE', 'BUSINESS_LICENSE', 'TAX_ID', 'OTHER'
    )),
    CONSTRAINT kyc_documents_status_check CHECK (status IN (
        'PENDING', 'UPLOADING', 'SCANNING', 'ENCRYPTING', 'READY', 'FAILED', 'REJECTED'
    )),
    CONSTRAINT kyc_documents_scan_check CHECK (scan_status IN (
        'PENDING', 'PASSED', 'FAILED', 'SKIPPED'
    )),
    CONSTRAINT kyc_documents_size_nonneg CHECK (size_bytes >= 0),
    CONSTRAINT kyc_documents_cipher_nonneg CHECK (ciphertext_size_bytes >= 0),
    CONSTRAINT kyc_documents_version_pos CHECK (doc_version >= 1)
);

CREATE INDEX kyc_documents_case_idx
    ON kyc_documents (case_id, document_type, doc_version DESC);

CREATE INDEX kyc_documents_merchant_idx
    ON kyc_documents (merchant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- kyc_case_transitions (immutable audit of SM edges)
-- ---------------------------------------------------------------------------
CREATE TABLE kyc_case_transitions (
    id                      text        PRIMARY KEY,
    case_id                 text        NOT NULL REFERENCES kyc_cases (id),
    from_status             text        NOT NULL,
    to_status               text        NOT NULL,
    actor_user_id           text,
    reason                  text        NOT NULL DEFAULT '',
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT kyc_case_transitions_from_nonempty CHECK (from_status <> ''),
    CONSTRAINT kyc_case_transitions_to_nonempty CHECK (to_status <> '')
);

CREATE INDEX kyc_case_transitions_case_idx
    ON kyc_case_transitions (case_id, created_at ASC, id ASC);

-- ---------------------------------------------------------------------------
-- api_credential_issuance_requests (minimal for BE-400 authorize-on-approve)
-- Full claim token/secret generation is BE-410.
-- ---------------------------------------------------------------------------
CREATE TABLE api_credential_issuance_requests (
    id                      text        PRIMARY KEY,
    merchant_id             text        NOT NULL REFERENCES merchants (id),
    payment_mode            text        NOT NULL,
    purpose                 text        NOT NULL DEFAULT 'API_KEY',
    capability              text        NOT NULL DEFAULT 'QRIS_API',
    status                  text        NOT NULL DEFAULT 'PENDING_KYC',
    kyc_case_id             text        REFERENCES kyc_cases (id),
    kyc_version             integer,
    requester_user_id       text        REFERENCES users (id),
    authorizer_user_id      text        REFERENCES users (id),
    reason                  text        NOT NULL DEFAULT '',
    authorized_at           timestamptz,
    claimed_at              timestamptz,
    expires_at              timestamptz,
    revoked_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT api_cred_issuance_mode_check CHECK (payment_mode IN ('SANDBOX', 'LIVE')),
    CONSTRAINT api_cred_issuance_purpose_check CHECK (purpose IN ('API_KEY', 'ROTATION')),
    CONSTRAINT api_cred_issuance_cap_check CHECK (capability = 'QRIS_API'),
    CONSTRAINT api_cred_issuance_status_check CHECK (status IN (
        'PENDING_KYC', 'AUTHORIZED', 'CLAIMED', 'EXPIRED', 'REVOKED'
    ))
);

CREATE INDEX api_cred_issuance_merchant_idx
    ON api_credential_issuance_requests (merchant_id, payment_mode, status);

-- At most one outstanding (PENDING_KYC or AUTHORIZED) request per merchant/mode.
CREATE UNIQUE INDEX api_cred_issuance_outstanding_uidx
    ON api_credential_issuance_requests (merchant_id, payment_mode)
    WHERE status IN ('PENDING_KYC', 'AUTHORIZED');

-- Link capability.kyc_case_id to cases (optional FK; column already on merchant_api_capabilities).
ALTER TABLE merchant_api_capabilities
    ADD CONSTRAINT merchant_api_capabilities_kyc_case_fkey
    FOREIGN KEY (kyc_case_id) REFERENCES kyc_cases (id);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('kyc', 'BE-400', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
