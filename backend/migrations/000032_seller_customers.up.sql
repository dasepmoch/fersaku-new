-- SEL-260: store-scoped seller customer notes (customer aggregate is derived from orders).
-- Customer identity key: sha256 hex of (store_id || unit separator || lower(trim(buyer_email))).

CREATE TABLE store_customer_notes (
    id              text        PRIMARY KEY,
    store_id        text        NOT NULL REFERENCES stores (id) ON DELETE CASCADE,
    customer_id     text        NOT NULL,
    body            text        NOT NULL DEFAULT '',
    version         integer     NOT NULL DEFAULT 1,
    author_user_id  text        REFERENCES users (id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT store_customer_notes_body_len CHECK (char_length(body) <= 4000),
    CONSTRAINT store_customer_notes_version_pos CHECK (version >= 1),
    CONSTRAINT store_customer_notes_customer_id_nonempty CHECK (customer_id <> '')
);

CREATE UNIQUE INDEX store_customer_notes_store_customer_uidx
    ON store_customer_notes (store_id, customer_id);

CREATE INDEX store_customer_notes_store_updated_idx
    ON store_customer_notes (store_id, updated_at DESC);

-- Stable lookup helpers for order → customer_id (email-normalized within store).
CREATE INDEX orders_store_buyer_email_lower_idx
    ON orders (store_id, lower(trim(buyer_email)))
    WHERE buyer_email <> '';
