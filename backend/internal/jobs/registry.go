package jobs

import (
	"context"
	"time"
)

// JobName is a stable registry key for lease rows and metrics.
type JobName string

// Inventory of INT-185 lifecycle jobs.
const (
	JobCouponReservationExpiry       JobName = "coupon.reservation_expiry"
	JobInventoryReservationExpiry    JobName = "inventory.reservation_expiry"
	JobObjectUploadCleanup           JobName = "object.upload_cleanup"
	JobObjectMalwareScan             JobName = "object.malware_scan"
	JobCheckoutIntentExpiry          JobName = "checkout.intent_expiry"
	JobCheckoutUnknownReconciliation JobName = "checkout.unknown_reconciliation"
	JobDomainRevalidation            JobName = "domain.dns_tls_revalidation"
	JobWithdrawalQuoteExpiry         JobName = "withdrawal.quote_expiry"
	JobWithdrawalUnknownLookup       JobName = "withdrawal.unknown_outcome_lookup"
	JobNotificationOutbox            JobName = "notification.outbox_retry"
	JobNotificationRetention         JobName = "notification.retention_purge"
	JobProviderCallbackOutbox        JobName = "provider.callback_outbox"
	JobSellerWebhookOutbox           JobName = "seller.webhook_outbox"
	JobSettlementRelease             JobName = "ledger.settlement_release"
	JobAnalyticsRetention            JobName = "analytics.retention"
	JobSessionCleanup                JobName = "identity.session_challenge_cleanup"
	JobImpersonationExpiry           JobName = "admin.impersonation_expiry"
	JobIdempotencyCleanup            JobName = "foundation.idempotency_cleanup"
)

// JobMeta describes cadence, batching, timeout, and ops metadata for a job.
type JobMeta struct {
	Name        JobName
	Owner       string // domain owner / runbook owner
	Description string
	Cadence     time.Duration
	BatchSize   int
	Timeout     time.Duration
	// LeaseTTL is how long a successful claim holds exclusive execution.
	// Should be >= Timeout + small buffer.
	LeaseTTL time.Duration
	// MaxAttempts is for outbox-style retries (0 = N/A).
	MaxAttempts int
	// RetryBackoff is base backoff for outbox workers (0 = default).
	RetryBackoff time.Duration
	// Retention documents data retention for purge jobs (0 = N/A).
	Retention time.Duration
	// AlertLag is the lag threshold for ops alerts.
	AlertLag time.Duration
	// Runbook is a short ops pointer (path or note).
	Runbook string
	// MetricsLabel is low-cardinality job label for metrics.
	MetricsLabel string
}

// JobFunc runs one batch. n is items processed (success or terminal).
// Must be idempotent under concurrent/double run.
type JobFunc func(ctx context.Context, batchSize int) (n int, err error)

// RegisteredJob pairs metadata with a runner.
type RegisteredJob struct {
	Meta JobMeta
	Run  JobFunc
}

// DefaultInventory returns canonical INT-185 job metadata (without runners).
func DefaultInventory() []JobMeta {
	return []JobMeta{
		{
			Name: JobCouponReservationExpiry, Owner: "coupons", Description: "Expire/release coupon holds past TTL",
			Cadence: 15 * time.Second, BatchSize: 50, Timeout: 30 * time.Second, LeaseTTL: 45 * time.Second,
			AlertLag: 2 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "coupon_reservation_expiry",
		},
		{
			Name: JobInventoryReservationExpiry, Owner: "inventory", Description: "Expire/release stock holds past TTL",
			Cadence: 15 * time.Second, BatchSize: 50, Timeout: 30 * time.Second, LeaseTTL: 45 * time.Second,
			AlertLag: 2 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "inventory_reservation_expiry",
		},
		{
			Name: JobObjectUploadCleanup, Owner: "objects", Description: "Abort orphan/expired UPLOADING object intents",
			Cadence: 1 * time.Minute, BatchSize: 50, Timeout: 45 * time.Second, LeaseTTL: 60 * time.Second,
			AlertLag: 10 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "object_upload_cleanup",
		},
		{
			Name: JobObjectMalwareScan, Owner: "objects", Description: "Process SCANNING quarantine malware scan retries",
			Cadence: 15 * time.Second, BatchSize: 25, Timeout: 90 * time.Second, LeaseTTL: 2 * time.Minute,
			MaxAttempts: objectsDefaultScanAttempts(), RetryBackoff: 15 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "docs/runbooks/malware-scan-quarantine.md", MetricsLabel: "object_malware_scan",
		},
		{
			Name: JobCheckoutIntentExpiry, Owner: "checkout", Description: "Expire storefront payment intents past expires_at",
			Cadence: 20 * time.Second, BatchSize: 25, Timeout: 60 * time.Second, LeaseTTL: 90 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "checkout_intent_expiry",
		},
		{
			Name: JobCheckoutUnknownReconciliation, Owner: "checkout", Description: "Safe provider lookup for UNKNOWN_OUTCOME intents",
			Cadence: 30 * time.Second, BatchSize: 20, Timeout: 60 * time.Second, LeaseTTL: 90 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "checkout_unknown_reconcile",
		},
		{
			Name: JobDomainRevalidation, Owner: "domains", Description: "DNS/TLS revalidation and tombstone release",
			Cadence: 2 * time.Minute, BatchSize: 50, Timeout: 90 * time.Second, LeaseTTL: 2 * time.Minute,
			AlertLag: 15 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "domain_revalidation",
		},
		{
			Name: JobWithdrawalQuoteExpiry, Owner: "withdrawals", Description: "Mark ACTIVE quotes past expires_at as EXPIRED",
			Cadence: 30 * time.Second, BatchSize: 100, Timeout: 20 * time.Second, LeaseTTL: 30 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "withdrawal_quote_expiry",
		},
		{
			Name: JobWithdrawalUnknownLookup, Owner: "withdrawals", Description: "Disbursement unknown-outcome provider lookup",
			Cadence: 30 * time.Second, BatchSize: 20, Timeout: 60 * time.Second, LeaseTTL: 90 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "withdrawal_unknown_lookup",
		},
		{
			Name: JobNotificationOutbox, Owner: "notifications", Description: "notification.dispatch / email.send outbox retry",
			Cadence: 2 * time.Second, BatchSize: 25, Timeout: 45 * time.Second, LeaseTTL: 60 * time.Second,
			MaxAttempts: 8, RetryBackoff: 2 * time.Second, AlertLag: 2 * time.Minute,
			Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "notification_outbox",
		},
		{
			Name: JobNotificationRetention, Owner: "notifications", Description: "Purge STANDARD retention inbox rows past policy",
			Cadence: 1 * time.Hour, BatchSize: 500, Timeout: 2 * time.Minute, LeaseTTL: 3 * time.Minute,
			Retention: 90 * 24 * time.Hour, AlertLag: 48 * time.Hour,
			Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "notification_retention",
		},
		{
			Name: JobProviderCallbackOutbox, Owner: "payments", Description: "provider_callback.process outbox retry/DLQ",
			Cadence: 2 * time.Second, BatchSize: 25, Timeout: 45 * time.Second, LeaseTTL: 60 * time.Second,
			MaxAttempts: 12, AlertLag: 2 * time.Minute,
			Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "provider_callback_outbox",
		},
		{
			Name: JobSellerWebhookOutbox, Owner: "webhooks", Description: "seller_webhook.deliver outbox retry/DLQ",
			Cadence: 2 * time.Second, BatchSize: 25, Timeout: 45 * time.Second, LeaseTTL: 60 * time.Second,
			MaxAttempts: 12, AlertLag: 2 * time.Minute,
			Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "seller_webhook_outbox",
		},
		{
			Name: JobSettlementRelease, Owner: "ledger", Description: "Post SETTLEMENT_RELEASE for due pending lots",
			Cadence: 5 * time.Second, BatchSize: 50, Timeout: 45 * time.Second, LeaseTTL: 60 * time.Second,
			AlertLag: 5 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "settlement_release",
		},
		{
			Name: JobAnalyticsRetention, Owner: "analytics", Description: "Raw event retention deletion + session anonymize",
			Cadence: 6 * time.Hour, BatchSize: 1, Timeout: 10 * time.Minute, LeaseTTL: 15 * time.Minute,
			AlertLag: 48 * time.Hour, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "analytics_retention",
		},
		{
			Name: JobSessionCleanup, Owner: "identity", Description: "Delete expired sessions and consumed/expired challenges",
			Cadence: 15 * time.Minute, BatchSize: 500, Timeout: 60 * time.Second, LeaseTTL: 90 * time.Second,
			Retention: 7 * 24 * time.Hour, AlertLag: 24 * time.Hour,
			Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "session_cleanup",
		},
		{
			Name: JobImpersonationExpiry, Owner: "admin", Description: "Mark expired active impersonation sessions",
			Cadence: 1 * time.Minute, BatchSize: 100, Timeout: 30 * time.Second, LeaseTTL: 45 * time.Second,
			AlertLag: 10 * time.Minute, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "impersonation_expiry",
		},
		{
			Name: JobIdempotencyCleanup, Owner: "foundation", Description: "Delete expired idempotency_records",
			Cadence: 30 * time.Minute, BatchSize: 1000, Timeout: 60 * time.Second, LeaseTTL: 90 * time.Second,
			AlertLag: 24 * time.Hour, Runbook: "TASK/02-FOUNDATION-TRANSPORT-AUTH.md#INT-185", MetricsLabel: "idempotency_cleanup",
		},
	}
}

// Registry holds registered jobs for the HA runner.
type Registry struct {
	jobs []RegisteredJob
	by   map[JobName]int
}

// NewRegistry creates an empty registry.
func NewRegistry() *Registry {
	return &Registry{by: make(map[JobName]int)}
}

// Register adds or replaces a job. Run must be non-nil.
func (r *Registry) Register(meta JobMeta, run JobFunc) {
	if r.by == nil {
		r.by = make(map[JobName]int)
	}
	if run == nil {
		run = func(context.Context, int) (int, error) { return 0, nil }
	}
	j := RegisteredJob{Meta: meta, Run: run}
	if i, ok := r.by[meta.Name]; ok {
		r.jobs[i] = j
		return
	}
	r.by[meta.Name] = len(r.jobs)
	r.jobs = append(r.jobs, j)
}

// All returns registered jobs in registration order.
func (r *Registry) All() []RegisteredJob {
	out := make([]RegisteredJob, len(r.jobs))
	copy(out, r.jobs)
	return out
}

// Get returns a registered job by name.
func (r *Registry) Get(name JobName) (RegisteredJob, bool) {
	i, ok := r.by[name]
	if !ok {
		return RegisteredJob{}, false
	}
	return r.jobs[i], true
}

// MetaByName looks up inventory metadata even if not registered with a runner.
func MetaByName(name JobName) (JobMeta, bool) {
	for _, m := range DefaultInventory() {
		if m.Name == name {
			return m, true
		}
	}
	return JobMeta{}, false
}

func objectsDefaultScanAttempts() int { return 5 }
