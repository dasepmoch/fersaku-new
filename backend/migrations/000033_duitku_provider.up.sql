-- PROD dual-provider (ADR-0008): allow DUITKU as payment ingress provider.
-- Historical XENDIT payment rows remain valid; disbursement stays Xendit-named where applicable.

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_provider_check;
ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_provider_check
  CHECK (provider = ANY (ARRAY['XENDIT'::text, 'DUITKU'::text]));

ALTER TABLE provider_callback_rejections
  DROP CONSTRAINT IF EXISTS provider_callback_rejections_provider_check;
ALTER TABLE provider_callback_rejections
  ADD CONSTRAINT provider_callback_rejections_provider_check
  CHECK (provider = ANY (ARRAY['XENDIT'::text, 'DUITKU'::text]));

ALTER TABLE payment_settlements
  DROP CONSTRAINT IF EXISTS payment_settlements_provider_check;
ALTER TABLE payment_settlements
  ADD CONSTRAINT payment_settlements_provider_check
  CHECK (provider = ANY (ARRAY['XENDIT'::text, 'DUITKU'::text]));
