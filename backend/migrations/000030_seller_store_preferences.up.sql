-- INT-150: server-stored preferred store for seller current-store selection.
-- Preference is validated against active membership stores; invalid → canonical.
CREATE TABLE IF NOT EXISTS seller_store_preferences (
    user_id             text        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    preferred_store_id  text        REFERENCES stores (id) ON DELETE SET NULL,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_store_preferences_store_idx
    ON seller_store_preferences (preferred_store_id)
    WHERE preferred_store_id IS NOT NULL;
