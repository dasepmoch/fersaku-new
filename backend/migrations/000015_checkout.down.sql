-- BE-310 rollback
DROP TABLE IF EXISTS payment_provider_events;
DROP TABLE IF EXISTS payment_intents;

ALTER TABLE orders DROP COLUMN IF EXISTS order_status;
ALTER TABLE orders DROP COLUMN IF EXISTS payment_mode;
ALTER TABLE orders DROP COLUMN IF EXISTS fee_snapshot_id;
ALTER TABLE orders DROP COLUMN IF EXISTS coupon_reservation_id;
ALTER TABLE orders DROP COLUMN IF EXISTS public_token_hash;
ALTER TABLE orders DROP COLUMN IF EXISTS buyer_session_id;
ALTER TABLE orders DROP COLUMN IF EXISTS expires_at;
ALTER TABLE orders DROP COLUMN IF EXISTS idempotency_key_hash;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN (
    'UNPAID', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'
));

DELETE FROM schema_meta WHERE key = 'checkout';
