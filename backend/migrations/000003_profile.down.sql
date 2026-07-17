DROP TABLE IF EXISTS user_notification_preferences;
DROP TABLE IF EXISTS email_change_requests;
DROP TABLE IF EXISTS user_profiles;

ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_purpose_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_purpose_check
    CHECK (purpose IN (
        'EMAIL_VERIFY',
        'PASSWORD_RESET',
        'MAGIC_LINK',
        'MFA_ENROLL'
    ));

DELETE FROM schema_meta WHERE key = 'profile';
