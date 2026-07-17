// Package credentials owns merchant API key lifecycle and one-time claim (BE-410).
//
// Rules:
//   - Single ACTIVE merchant API authentication key (partial unique index).
//   - Store prefix + keyed hash only; raw key generated only on successful claim.
//   - Admin/support may authorize/suspend/revoke but never receive raw keys.
//   - LIVE claim requires ACTIVE KYC capability at claim transaction time.
//   - SANDBOX may issue without KYC.
//   - Claim tokens are §6.5 fragment→POST body only (never query/path).
//   - Webhook endpoint secrets are independent (envelope ciphertext; claim skeleton for BE-420).
package credentials
