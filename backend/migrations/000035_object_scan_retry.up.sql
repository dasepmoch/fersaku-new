-- GAP-02: malware scan retry / quarantine metadata on object_refs.
-- Existing scan_status/scan_verdict/scan_version/scan_at remain authoritative for evidence.

ALTER TABLE object_refs
    ADD COLUMN IF NOT EXISTS scan_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS scan_error_class text,
    ADD COLUMN IF NOT EXISTS scan_next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS object_refs_scanning_retry_idx
    ON object_refs (status, scan_next_retry_at, updated_at)
    WHERE status = 'SCANNING';
