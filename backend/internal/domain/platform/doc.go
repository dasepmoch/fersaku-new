// Package platform owns platform fee policy versions, pure fee calculators,
// and related operational invariants (BE-300 / ADR-0003).
//
// Money is int64 whole-rupiah IDR only. LAUNCH_FEE_POLICY_V1 is immutable via
// admin/runtime API; future versions require approved ADR + migration seed.
package platform
