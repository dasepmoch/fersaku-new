-- Reverse BE-200 onboarding columns/triggers.

DROP TRIGGER IF EXISTS stores_prevent_last_store_archive_trg ON stores;
DROP TRIGGER IF EXISTS stores_prevent_last_store_delete_trg ON stores;
DROP FUNCTION IF EXISTS stores_prevent_last_store_archive();
DROP FUNCTION IF EXISTS stores_prevent_last_store_delete();

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_revision_check,
    DROP CONSTRAINT IF EXISTS stores_slug_format_check,
    DROP CONSTRAINT IF EXISTS stores_onboarding_step_check,
    DROP CONSTRAINT IF EXISTS stores_onboarding_state_check;

ALTER TABLE stores
    DROP COLUMN IF EXISTS published_revision,
    DROP COLUMN IF EXISTS storefront_revision,
    DROP COLUMN IF EXISTS onboarding_progress,
    DROP COLUMN IF EXISTS onboarding_completed_at,
    DROP COLUMN IF EXISTS onboarding_step,
    DROP COLUMN IF EXISTS onboarding_state,
    DROP COLUMN IF EXISTS accent_color,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS bio;

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_onboarding_step_check,
    DROP CONSTRAINT IF EXISTS merchants_onboarding_state_check;

ALTER TABLE merchants
    DROP COLUMN IF EXISTS onboarding_progress,
    DROP COLUMN IF EXISTS onboarding_completed_at,
    DROP COLUMN IF EXISTS onboarding_step,
    DROP COLUMN IF EXISTS onboarding_state,
    DROP COLUMN IF EXISTS business_type,
    DROP COLUMN IF EXISTS legal_name;

DELETE FROM schema_meta WHERE key = 'onboarding';
