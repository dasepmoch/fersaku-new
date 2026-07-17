// Package ledger owns append-only double-entry journals and merchant wallet balances (BE-340).
//
// Posting is closed-template only (PAYMENT_CAPTURE, SETTLEMENT_RELEASE, …).
// The application never supplies arbitrary account legs over HTTP; DB routine
// post_ledger_transaction enforces balanced positive whole-IDR journals.
// Balance projections accelerate reads; rebuild_merchant_balances must match.
package ledger
