// Package analytics owns storefront attribution and aggregate reporting models (BE-360).
// PostgreSQL snapshots/ledger remain authority; Redis counters may only accelerate.
// QRIS API intents never fabricate storefront traffic. Analytics cannot authorize payment/ledger.
package analytics
