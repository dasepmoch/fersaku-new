-- BE-420 down: drop outbound delivery tables; leave endpoint secret skeleton (BE-410).

DROP TABLE IF EXISTS webhook_dead_letters;
DROP TABLE IF EXISTS webhook_delivery_attempts;
DROP TABLE IF EXISTS webhook_deliveries;

ALTER TABLE webhook_endpoint_secret_versions
    DROP COLUMN IF EXISTS overlap_expires_at;

ALTER TABLE seller_webhook_endpoints
    DROP COLUMN IF EXISTS store_id,
    DROP COLUMN IF EXISTS url_host,
    DROP COLUMN IF EXISTS current_secret_version,
    DROP COLUMN IF EXISTS previous_secret_version,
    DROP COLUMN IF EXISTS secret_overlap_expires_at,
    DROP COLUMN IF EXISTS disabled_at,
    DROP COLUMN IF EXISTS disabled_reason;

DELETE FROM schema_meta WHERE key = 'webhooks';
