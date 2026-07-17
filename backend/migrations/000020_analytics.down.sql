-- BE-360 down: drop analytics tables (order respects FKs).

DROP TABLE IF EXISTS analytics_retention_runs;
DROP TABLE IF EXISTS store_traffic_daily;
DROP TABLE IF EXISTS order_attribution_snapshots;
DROP TABLE IF EXISTS attribution_events;
DROP TABLE IF EXISTS storefront_sessions;
DROP TABLE IF EXISTS analytics_collection_policies;

DELETE FROM schema_meta WHERE key IN (
    'analytics',
    'analytics_aggregation_version',
    'analytics_hash_key_version'
);
