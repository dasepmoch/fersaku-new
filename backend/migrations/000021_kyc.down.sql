-- BE-400 down: drop KYC + issuance authorization tables.

ALTER TABLE merchant_api_capabilities
    DROP CONSTRAINT IF EXISTS merchant_api_capabilities_kyc_case_fkey;

DROP TABLE IF EXISTS api_credential_issuance_requests;
DROP TABLE IF EXISTS kyc_case_transitions;
DROP TABLE IF EXISTS kyc_documents;
DROP TABLE IF EXISTS kyc_cases;

DELETE FROM schema_meta WHERE key = 'kyc';
