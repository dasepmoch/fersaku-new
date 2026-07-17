-- BE-215 down: drop coupon schema.

DROP TABLE IF EXISTS coupon_redemptions;
DROP TABLE IF EXISTS coupon_reservations;
DROP TABLE IF EXISTS coupon_product_scopes;
DROP TABLE IF EXISTS coupons;

DELETE FROM schema_meta WHERE key = 'coupons';
