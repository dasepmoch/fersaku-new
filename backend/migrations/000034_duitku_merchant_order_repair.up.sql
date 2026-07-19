-- GAP-01: Duitku status lookup must use merchantOrderId (external_id), not provider reference.
-- Historical rows already store merchant order id in payment_intents.external_id and
-- Duitku reference in payment_intents.provider_reference when create succeeded.
-- This migration does NOT rewrite identifiers (would be unsafe guessing).
-- It materializes a repair/audit report for operators.

CREATE TABLE IF NOT EXISTS duitku_merchant_order_repair_report (
    payment_intent_id   text        PRIMARY KEY,
    payment_mode        text        NOT NULL,
    external_id         text        NOT NULL,
    provider_reference  text,
    status              text        NOT NULL,
    repair_action       text        NOT NULL,
    notes               text        NOT NULL,
    reported_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE duitku_merchant_order_repair_report IS
  'GAP-01 audit: Duitku intents and how status lookup should resolve (merchantOrderId=external_id). No blind ID rewrite.';

-- Report all DUITKU intents with both ids present (healthy mapping).
INSERT INTO duitku_merchant_order_repair_report (
    payment_intent_id, payment_mode, external_id, provider_reference, status, repair_action, notes
)
SELECT
    id,
    payment_mode,
    external_id,
    provider_reference,
    status,
    'NO_REWRITE_REQUIRED',
    'status lookup uses external_id as merchantOrderId; provider_reference is Duitku reference only'
FROM payment_intents
WHERE provider = 'DUITKU'
  AND external_id IS NOT NULL
  AND btrim(external_id) <> ''
  AND provider_reference IS NOT NULL
  AND btrim(provider_reference) <> ''
ON CONFLICT (payment_intent_id) DO NOTHING;

-- Report DUITKU intents missing provider_reference (create never completed / unknown outcome).
INSERT INTO duitku_merchant_order_repair_report (
    payment_intent_id, payment_mode, external_id, provider_reference, status, repair_action, notes
)
SELECT
    id,
    payment_mode,
    external_id,
    provider_reference,
    status,
    'LOOKUP_BY_EXTERNAL_ID_ONLY',
    'no provider_reference stored; reconciliation may use external_id if inquiry reached Duitku'
FROM payment_intents
WHERE provider = 'DUITKU'
  AND external_id IS NOT NULL
  AND btrim(external_id) <> ''
  AND (provider_reference IS NULL OR btrim(provider_reference) = '')
ON CONFLICT (payment_intent_id) DO NOTHING;

-- Flag impossible empty external_id rows (must not invent merchantOrderId).
INSERT INTO duitku_merchant_order_repair_report (
    payment_intent_id, payment_mode, external_id, provider_reference, status, repair_action, notes
)
SELECT
    id,
    payment_mode,
    COALESCE(external_id, ''),
    provider_reference,
    status,
    'MANUAL_REVIEW_REQUIRED',
    'missing external_id; cannot derive merchantOrderId without operator mapping'
FROM payment_intents
WHERE provider = 'DUITKU'
  AND (external_id IS NULL OR btrim(external_id) = '')
ON CONFLICT (payment_intent_id) DO NOTHING;
