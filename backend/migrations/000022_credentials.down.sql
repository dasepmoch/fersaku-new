-- BE-410 down

DROP TABLE IF EXISTS webhook_endpoint_secret_versions;
DROP TABLE IF EXISTS secret_claims;

ALTER TABLE api_credential_issuance_requests
    DROP COLUMN IF EXISTS claim_token_hash,
    DROP COLUMN IF EXISTS claim_expires_at,
    DROP COLUMN IF EXISTS claim_recipient_user_id,
    DROP COLUMN IF EXISTS claim_attempts,
    DROP COLUMN IF EXISTS claim_consumed_at,
    DROP COLUMN IF EXISTS mfa_binding_session_id,
    DROP COLUMN IF EXISTS expected_predecessor_key_id,
    DROP COLUMN IF EXISTS expected_version,
    DROP COLUMN IF EXISTS request_version,
    DROP COLUMN IF EXISTS idempotency_key_hash,
    DROP COLUMN IF EXISTS resulting_api_key_id;

ALTER TABLE api_credential_issuance_requests
    DROP CONSTRAINT IF EXISTS api_cred_issuance_purpose_check;
ALTER TABLE api_credential_issuance_requests
    ADD CONSTRAINT api_cred_issuance_purpose_check CHECK (purpose IN ('API_KEY', 'ROTATION'));

ALTER TABLE merchant_api_keys
    DROP COLUMN IF EXISTS key_version,
    DROP COLUMN IF EXISTS issuance_request_id,
    DROP COLUMN IF EXISTS fingerprint;

DELETE FROM schema_meta WHERE key = 'credentials';
