-- Revert dual-provider payment identity (only if no DUITKU rows remain).

ALTER TABLE payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_provider_check;
ALTER TABLE payment_intents
  ADD CONSTRAINT payment_intents_provider_check CHECK (provider = 'XENDIT');

ALTER TABLE provider_callback_rejections
  DROP CONSTRAINT IF EXISTS provider_callback_rejections_provider_check;
ALTER TABLE provider_callback_rejections
  ADD CONSTRAINT provider_callback_rejections_provider_check CHECK (provider = 'XENDIT');

ALTER TABLE payment_settlements
  DROP CONSTRAINT IF EXISTS payment_settlements_provider_check;
ALTER TABLE payment_settlements
  ADD CONSTRAINT payment_settlements_provider_check CHECK (provider = 'XENDIT');
