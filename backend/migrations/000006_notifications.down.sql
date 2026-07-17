-- BE-140 down: drop notification tables (preferences remain BE-125).

DROP TABLE IF EXISTS notification_suppressions;
DROP TABLE IF EXISTS notification_delivery_attempts;
DROP TABLE IF EXISTS notifications;

DELETE FROM schema_meta WHERE key = 'notifications';
