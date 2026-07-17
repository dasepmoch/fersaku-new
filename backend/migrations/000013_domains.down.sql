DROP INDEX IF EXISTS store_domains_active_hostname_uidx;
DROP INDEX IF EXISTS store_domains_tombstone_cooldown_idx;
DROP INDEX IF EXISTS store_domains_status_next_check_idx;
DROP INDEX IF EXISTS store_domains_merchant_idx;
DROP INDEX IF EXISTS store_domains_store_created_idx;
DROP INDEX IF EXISTS store_domains_hostname_claim_uidx;
DROP TABLE IF EXISTS store_domains;
