-- BE-200 Merchant/store onboarding.
-- Canonical store invariant (ADR-0007): every merchant has exactly one is_canonical store.
-- Slug rules (application + DB): lowercase [a-z0-9-], collapse hyphens, no leading/trailing
-- hyphen, length 3..63, globally unique; reserved names rejected in app.

-- ---------------------------------------------------------------------------
-- merchants: onboarding lifecycle (merchant-scoped wallet/KYC later)
-- ---------------------------------------------------------------------------
ALTER TABLE merchants
    ADD COLUMN IF NOT EXISTS legal_name text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_onboarding_state_check;
ALTER TABLE merchants
    ADD CONSTRAINT merchants_onboarding_state_check
        CHECK (onboarding_state IN (
            'NOT_STARTED',
            'IDENTITY',
            'SLUG',
            'VISUAL',
            'PRODUCT_OPTIONAL',
            'COMPLETE'
        ));

ALTER TABLE merchants
    DROP CONSTRAINT IF EXISTS merchants_onboarding_step_check;
ALTER TABLE merchants
    ADD CONSTRAINT merchants_onboarding_step_check
        CHECK (onboarding_step IN (
            'NOT_STARTED',
            'IDENTITY',
            'SLUG',
            'VISUAL',
            'PRODUCT_OPTIONAL',
            'COMPLETE'
        ));

-- ---------------------------------------------------------------------------
-- stores: identity/slug/visual + onboarding mirror + revision placeholders
-- ---------------------------------------------------------------------------
ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS bio text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS onboarding_state text NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'NOT_STARTED',
    ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
    ADD COLUMN IF NOT EXISTS onboarding_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS storefront_revision bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS published_revision bigint NOT NULL DEFAULT 0;

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_onboarding_state_check;
ALTER TABLE stores
    ADD CONSTRAINT stores_onboarding_state_check
        CHECK (onboarding_state IN (
            'NOT_STARTED',
            'IDENTITY',
            'SLUG',
            'VISUAL',
            'PRODUCT_OPTIONAL',
            'COMPLETE'
        ));

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_onboarding_step_check;
ALTER TABLE stores
    ADD CONSTRAINT stores_onboarding_step_check
        CHECK (onboarding_step IN (
            'NOT_STARTED',
            'IDENTITY',
            'SLUG',
            'VISUAL',
            'PRODUCT_OPTIONAL',
            'COMPLETE'
        ));

-- Normalized slug shape (app still owns reserved list + full normalize).
ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_slug_format_check;
ALTER TABLE stores
    ADD CONSTRAINT stores_slug_format_check
        CHECK (
            slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
            AND char_length(slug) BETWEEN 3 AND 63
        );

ALTER TABLE stores
    DROP CONSTRAINT IF EXISTS stores_revision_check;
ALTER TABLE stores
    ADD CONSTRAINT stores_revision_check
        CHECK (storefront_revision >= 0 AND published_revision >= 0);

-- ---------------------------------------------------------------------------
-- No last-store / no sole-canonical deletion or archive to unusable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stores_prevent_last_store_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    remaining bigint;
    remaining_canonical bigint;
BEGIN
    SELECT COUNT(*) INTO remaining
    FROM stores
    WHERE merchant_id = OLD.merchant_id
      AND id <> OLD.id
      AND status <> 'ARCHIVED';

    IF remaining = 0 THEN
        RAISE EXCEPTION 'cannot delete last store for merchant %', OLD.merchant_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.is_canonical THEN
        SELECT COUNT(*) INTO remaining_canonical
        FROM stores
        WHERE merchant_id = OLD.merchant_id
          AND id <> OLD.id
          AND is_canonical = true
          AND status <> 'ARCHIVED';
        IF remaining_canonical = 0 THEN
            RAISE EXCEPTION 'cannot delete sole canonical store for merchant %', OLD.merchant_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS stores_prevent_last_store_delete_trg ON stores;
CREATE TRIGGER stores_prevent_last_store_delete_trg
    BEFORE DELETE ON stores
    FOR EACH ROW
    EXECUTE FUNCTION stores_prevent_last_store_delete();

CREATE OR REPLACE FUNCTION stores_prevent_last_store_archive()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    remaining bigint;
BEGIN
    IF NEW.status = 'ARCHIVED' AND OLD.status IS DISTINCT FROM 'ARCHIVED' THEN
        SELECT COUNT(*) INTO remaining
        FROM stores
        WHERE merchant_id = OLD.merchant_id
          AND id <> OLD.id
          AND status <> 'ARCHIVED';
        IF remaining = 0 THEN
            RAISE EXCEPTION 'cannot archive last store for merchant %', OLD.merchant_id
                USING ERRCODE = 'check_violation';
        END IF;
        IF OLD.is_canonical AND remaining = 0 THEN
            RAISE EXCEPTION 'cannot archive sole canonical store for merchant %', OLD.merchant_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_prevent_last_store_archive_trg ON stores;
CREATE TRIGGER stores_prevent_last_store_archive_trg
    BEFORE UPDATE OF status ON stores
    FOR EACH ROW
    EXECUTE FUNCTION stores_prevent_last_store_archive();

INSERT INTO schema_meta (key, value, updated_at) VALUES
    ('onboarding', 'BE-200', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
