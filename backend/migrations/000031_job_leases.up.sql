-- INT-185 HA worker job leases (multi-replica exclusive cadence locks).

CREATE TABLE job_leases (
    job_name         text        PRIMARY KEY,
    owner            text        NOT NULL,
    lease_until      timestamptz NOT NULL,
    locked_at        timestamptz NOT NULL DEFAULT now(),
    last_success_at  timestamptz,
    last_error       text,
    run_count        bigint      NOT NULL DEFAULT 0,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT job_leases_owner_nonempty CHECK (owner <> ''),
    CONSTRAINT job_leases_name_nonempty CHECK (job_name <> ''),
    CONSTRAINT job_leases_run_count_nonneg CHECK (run_count >= 0)
);

CREATE INDEX job_leases_lease_until_idx ON job_leases (lease_until);

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('job_leases', 'INT-185', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
