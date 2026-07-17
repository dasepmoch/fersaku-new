-- BE-320 down: drop gateway tables and payment_intents gateway columns.

DROP TABLE IF EXISTS gateway_payment_events;
DROP TABLE IF EXISTS seller_webhook_endpoints;
DROP TABLE IF EXISTS gateway_redirect_origins;
DROP TABLE IF EXISTS merchant_api_capabilities;
DROP TABLE IF EXISTS merchant_api_keys;

DROP INDEX IF EXISTS payment_intents_merchant_ref_lookup_idx;
DROP INDEX IF EXISTS payment_intents_merchant_ref_uidx;

ALTER TABLE payment_intents
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS webhook_config_version,
    DROP COLUMN IF EXISTS webhook_endpoint_id,
    DROP COLUMN IF EXISTS failure_url,
    DROP COLUMN IF EXISTS success_url,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS merchant_reference;

DELETE FROM schema_meta WHERE key = 'gateway';
