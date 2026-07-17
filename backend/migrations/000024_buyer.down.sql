-- BE-430 down: drop buyer review tables.

DELETE FROM schema_meta WHERE key = 'be_430_buyer';

DROP TABLE IF EXISTS product_review_reports;
DROP TABLE IF EXISTS product_review_replies;
DROP TABLE IF EXISTS product_reviews;
