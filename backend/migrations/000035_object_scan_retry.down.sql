DROP INDEX IF EXISTS object_refs_scanning_retry_idx;

ALTER TABLE object_refs
    DROP COLUMN IF EXISTS scan_next_retry_at,
    DROP COLUMN IF EXISTS scan_error_class,
    DROP COLUMN IF EXISTS scan_attempts;
