-- BE-430 Buyer identity / purchases / delivery / reviews.
-- Reviews: verified purchase only; unique per buyer+order_item.
-- Purchase ownership reuses orders.buyer_user_id (000012).

CREATE TABLE product_reviews (
    id                  text        PRIMARY KEY,
    store_id            text        NOT NULL REFERENCES stores (id),
    merchant_id         text        NOT NULL REFERENCES merchants (id),
    product_id          text        NOT NULL REFERENCES products (id),
    order_id            text        NOT NULL REFERENCES orders (id),
    order_item_id       text        NOT NULL REFERENCES order_items (id),
    buyer_user_id       text        NOT NULL REFERENCES users (id),
    rating              smallint    NOT NULL,
    title               text        NOT NULL DEFAULT '',
    body                text        NOT NULL DEFAULT '',
    status              text        NOT NULL DEFAULT 'PUBLISHED',
    verified_purchase   boolean     NOT NULL DEFAULT true,
    content_version     integer     NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT product_reviews_status_check CHECK (status IN (
        'PENDING', 'PUBLISHED', 'NEEDS_EDIT', 'REMOVED'
    )),
    CONSTRAINT product_reviews_title_len CHECK (char_length(title) <= 200),
    CONSTRAINT product_reviews_body_len CHECK (char_length(body) <= 4000),
    CONSTRAINT product_reviews_version_pos CHECK (content_version >= 1)
);

-- One review per buyer/order item at launch.
CREATE UNIQUE INDEX product_reviews_buyer_order_item_uidx
    ON product_reviews (buyer_user_id, order_item_id);
CREATE UNIQUE INDEX product_reviews_order_item_uidx
    ON product_reviews (order_item_id);

CREATE INDEX product_reviews_product_status_created_idx
    ON product_reviews (product_id, status, created_at DESC, id DESC);
CREATE INDEX product_reviews_store_status_created_idx
    ON product_reviews (store_id, status, created_at DESC, id DESC);
CREATE INDEX product_reviews_buyer_created_idx
    ON product_reviews (buyer_user_id, created_at DESC, id DESC);

CREATE TABLE product_review_replies (
    id                  text        PRIMARY KEY,
    review_id           text        NOT NULL REFERENCES product_reviews (id) ON DELETE CASCADE,
    store_id            text        NOT NULL REFERENCES stores (id),
    author_user_id      text        NOT NULL REFERENCES users (id),
    body                text        NOT NULL,
    content_version     integer     NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_review_replies_body_nonempty CHECK (body <> ''),
    CONSTRAINT product_review_replies_body_len CHECK (char_length(body) <= 2000),
    CONSTRAINT product_review_replies_version_pos CHECK (content_version >= 1)
);

-- One public seller reply per review at launch.
CREATE UNIQUE INDEX product_review_replies_review_uidx
    ON product_review_replies (review_id);

CREATE TABLE product_review_reports (
    id                  text        PRIMARY KEY,
    review_id           text        NOT NULL REFERENCES product_reviews (id) ON DELETE CASCADE,
    reporter_user_id    text        NOT NULL REFERENCES users (id),
    reason_code         text        NOT NULL,
    context             text        NOT NULL DEFAULT '',
    status              text        NOT NULL DEFAULT 'OPEN',
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_review_reports_reason_nonempty CHECK (reason_code <> ''),
    CONSTRAINT product_review_reports_reason_len CHECK (char_length(reason_code) <= 64),
    CONSTRAINT product_review_reports_context_len CHECK (char_length(context) <= 1000),
    CONSTRAINT product_review_reports_status_check CHECK (status IN (
        'OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED'
    ))
);

CREATE UNIQUE INDEX product_review_reports_dedupe_uidx
    ON product_review_reports (review_id, reporter_user_id, reason_code);
CREATE INDEX product_review_reports_review_idx
    ON product_review_reports (review_id, created_at DESC);

INSERT INTO schema_meta (key, value, updated_at)
VALUES ('be_430_buyer', '1', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
