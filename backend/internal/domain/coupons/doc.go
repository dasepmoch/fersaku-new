// Package coupons owns coupon policy, eligibility, pricing, and reservation
// state machines for BE-215. Limits are enforced by Postgres row locks and
// reservation uniqueness, not Redis counters. Client-supplied discounts are
// never authoritative.
package coupons
