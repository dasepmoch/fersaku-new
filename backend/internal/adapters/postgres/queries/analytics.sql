-- BE-360 analytics queries

-- name: AnalyticsGetActivePolicy :one
SELECT
    version_id, consent_notice_version, collection_version, reporting_timezone,
    raw_retention_days, aggregate_retention_days, last_non_direct_window_days,
    min_cohort_size, bot_filter_enabled, late_event_policy, anonymize_on_delete,
    checksum_sha256, is_active, effective_from, created_at
FROM analytics_collection_policies
WHERE is_active = true
LIMIT 1;

-- name: AnalyticsGetPolicyByVersion :one
SELECT
    version_id, consent_notice_version, collection_version, reporting_timezone,
    raw_retention_days, aggregate_retention_days, last_non_direct_window_days,
    min_cohort_size, bot_filter_enabled, late_event_policy, anonymize_on_delete,
    checksum_sha256, is_active, effective_from, created_at
FROM analytics_collection_policies
WHERE version_id = $1;

-- name: AnalyticsGetStore :one
SELECT id, merchant_id, name, status
FROM stores
WHERE id = $1;

-- name: AnalyticsInsertSession :one
INSERT INTO storefront_sessions (
    id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
    landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, channel, is_bot, collection_version,
    consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16,
    $17, $18, $19, $20, $21
)
ON CONFLICT (store_id, session_hash) DO UPDATE SET
    last_seen_at = EXCLUDED.last_seen_at,
    landing_path = CASE WHEN storefront_sessions.landing_path = '/' THEN EXCLUDED.landing_path ELSE storefront_sessions.landing_path END
RETURNING
    id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
    landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, channel, is_bot, collection_version,
    consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at;

-- name: AnalyticsGetSessionByHash :one
SELECT
    id, store_id, merchant_id, visitor_hash, session_hash, hash_key_version,
    landing_path, referrer_origin, utm_source, utm_medium, utm_campaign,
    utm_content, utm_term, channel, is_bot, collection_version,
    consent_notice_version, policy_version_id, first_seen_at, last_seen_at, created_at
FROM storefront_sessions
WHERE store_id = $1 AND session_hash = $2;

-- name: AnalyticsInsertEvent :one
INSERT INTO attribution_events (
    id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
    hash_key_version, event_type, landing_path, referrer_origin, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
    collection_version, consent_notice_version, policy_version_id, occurred_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18, $19,
    $20, $21, $22, $23, $24
)
RETURNING
    id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
    hash_key_version, event_type, landing_path, referrer_origin, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
    collection_version, consent_notice_version, policy_version_id, occurred_at, created_at;

-- name: AnalyticsListNonDirectEvents :many
SELECT
    id, store_id, merchant_id, session_id, product_id, visitor_hash, session_hash,
    hash_key_version, event_type, landing_path, referrer_origin, utm_source,
    utm_medium, utm_campaign, utm_content, utm_term, channel, is_bot, is_direct,
    collection_version, consent_notice_version, policy_version_id, occurred_at, created_at
FROM attribution_events
WHERE store_id = $1
  AND visitor_hash = $2
  AND is_bot = false
  AND is_direct = false
  AND occurred_at >= $3
  AND occurred_at <= $4
ORDER BY occurred_at DESC, id DESC
LIMIT 100;

-- name: AnalyticsInsertOrderSnapshot :one
INSERT INTO order_attribution_snapshots (
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18,
    $19, $20, $21, $22,
    $23, $24, $25, $26, $27, $28, $29
)
ON CONFLICT (order_id) DO NOTHING
RETURNING
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at;

-- name: AnalyticsGetOrderSnapshot :one
SELECT
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
FROM order_attribution_snapshots
WHERE order_id = $1;

-- name: AnalyticsGetOrderSnapshotByIntent :one
SELECT
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at
FROM order_attribution_snapshots
WHERE payment_intent_id = $1;

-- name: AnalyticsMarkConverted :one
UPDATE order_attribution_snapshots
SET converted = true,
    converted_at = $2,
    paid_late = $3,
    gross_idr = CASE WHEN $4::bigint > 0 THEN $4::bigint ELSE gross_idr END
WHERE order_id = $1
  AND converted = false
RETURNING
    id, order_id, payment_intent_id, store_id, merchant_id, product_id, source,
    visitor_hash, session_hash, hash_key_version, landing_path, referrer_origin,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term, channel,
    attribution_model, attributed_event_id, collection_version, consent_notice_version,
    policy_version_id, converted, converted_at, paid_late, gross_idr, captured_at, created_at;

-- name: AnalyticsDeleteDailyRange :exec
DELETE FROM store_traffic_daily
WHERE store_id = $1
  AND day >= $2::date
  AND day <= $3::date
  AND timezone = $4
  AND aggregation_version = $5;

-- name: AnalyticsUpsertDaily :one
INSERT INTO store_traffic_daily (
    id, store_id, merchant_id, day, timezone, channel, product_id,
    sessions, page_views, checkouts, orders, gross_idr,
    policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at
) VALUES (
    $1, $2, $3, $4::date, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17
)
ON CONFLICT (store_id, day, timezone, channel, product_id, aggregation_version) DO UPDATE SET
    sessions = EXCLUDED.sessions,
    page_views = EXCLUDED.page_views,
    checkouts = EXCLUDED.checkouts,
    orders = EXCLUDED.orders,
    gross_idr = EXCLUDED.gross_idr,
    policy_version_id = EXCLUDED.policy_version_id,
    rebuilt_at = EXCLUDED.rebuilt_at,
    updated_at = EXCLUDED.updated_at
RETURNING
    id, store_id, merchant_id, day, timezone, channel, product_id,
    sessions, page_views, checkouts, orders, gross_idr,
    policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at;

-- name: AnalyticsListDaily :many
SELECT
    id, store_id, merchant_id, day, timezone, channel, product_id,
    sessions, page_views, checkouts, orders, gross_idr,
    policy_version_id, aggregation_version, rebuilt_at, created_at, updated_at
FROM store_traffic_daily
WHERE store_id = $1
  AND day >= $2::date
  AND day <= $3::date
  AND timezone = $4
  AND aggregation_version = $5
  AND (sqlc.narg('channel')::text IS NULL OR channel = sqlc.narg('channel'))
  AND (
    sqlc.narg('cursor_day')::date IS NULL
    OR (day, id) < (sqlc.narg('cursor_day')::date, sqlc.narg('cursor_id')::text)
  )
ORDER BY day DESC, id DESC
LIMIT $6;

-- name: AnalyticsSumDaily :one
SELECT
    COALESCE(SUM(sessions), 0)::bigint AS sessions,
    COALESCE(SUM(page_views), 0)::bigint AS page_views,
    COALESCE(SUM(checkouts), 0)::bigint AS checkouts,
    COALESCE(SUM(orders), 0)::bigint AS orders,
    COALESCE(SUM(gross_idr), 0)::bigint AS gross_idr
FROM store_traffic_daily
WHERE store_id = $1
  AND day >= $2::date
  AND day <= $3::date
  AND timezone = $4
  AND aggregation_version = $5
  AND channel = 'all'
  AND product_id = '';

-- name: AnalyticsSumByChannel :many
SELECT
    channel,
    COALESCE(SUM(sessions), 0)::bigint AS sessions,
    COALESCE(SUM(orders), 0)::bigint AS orders,
    COALESCE(SUM(gross_idr), 0)::bigint AS gross_idr
FROM store_traffic_daily
WHERE store_id = $1
  AND day >= $2::date
  AND day <= $3::date
  AND timezone = $4
  AND aggregation_version = $5
  AND channel <> 'all'
  AND product_id = ''
GROUP BY channel
ORDER BY channel ASC;

-- name: AnalyticsCountSessionsByDayChannel :many
SELECT
    (first_seen_at AT TIME ZONE sqlc.arg('tz')::text)::date AS day,
    channel,
    COUNT(*)::bigint AS sessions
FROM storefront_sessions
WHERE store_id = sqlc.arg('store_id')
  AND is_bot = false
  AND (first_seen_at AT TIME ZONE sqlc.arg('tz')::text)::date >= sqlc.arg('from_day')::date
  AND (first_seen_at AT TIME ZONE sqlc.arg('tz')::text)::date <= sqlc.arg('to_day')::date
GROUP BY 1, 2
ORDER BY 1, 2;

-- name: AnalyticsCountEventsByDayChannel :many
SELECT
    (occurred_at AT TIME ZONE sqlc.arg('tz')::text)::date AS day,
    channel,
    event_type,
    COUNT(*)::bigint AS cnt
FROM attribution_events
WHERE store_id = sqlc.arg('store_id')
  AND is_bot = false
  AND (occurred_at AT TIME ZONE sqlc.arg('tz')::text)::date >= sqlc.arg('from_day')::date
  AND (occurred_at AT TIME ZONE sqlc.arg('tz')::text)::date <= sqlc.arg('to_day')::date
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- name: AnalyticsCountConversionsByDayChannel :many
SELECT
    (converted_at AT TIME ZONE sqlc.arg('tz')::text)::date AS day,
    channel,
    COALESCE(product_id, '') AS product_id,
    COUNT(*)::bigint AS orders,
    COALESCE(SUM(gross_idr), 0)::bigint AS gross_idr
FROM order_attribution_snapshots
WHERE store_id = sqlc.arg('store_id')
  AND source = 'STOREFRONT'
  AND converted = true
  AND converted_at IS NOT NULL
  AND (converted_at AT TIME ZONE sqlc.arg('tz')::text)::date >= sqlc.arg('from_day')::date
  AND (converted_at AT TIME ZONE sqlc.arg('tz')::text)::date <= sqlc.arg('to_day')::date
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- name: AnalyticsDeleteEventsBefore :execrows
DELETE FROM attribution_events
WHERE occurred_at < $1;

-- name: AnalyticsAnonymizeSessionsBefore :execrows
UPDATE storefront_sessions
SET visitor_hash = 'anon',
    session_hash = id,
    last_seen_at = last_seen_at
WHERE first_seen_at < $1
  AND visitor_hash <> 'anon';

-- name: AnalyticsInsertRetentionRun :one
INSERT INTO analytics_retention_runs (
    id, policy_version_id, cutoff_at, events_deleted, sessions_anonymized,
    status, started_at, finished_at, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING
    id, policy_version_id, cutoff_at, events_deleted, sessions_anonymized,
    status, started_at, finished_at, created_at;

-- name: AnalyticsCountConvertedByOrder :one
SELECT COUNT(*)::bigint AS n
FROM order_attribution_snapshots
WHERE order_id = $1 AND converted = true;
