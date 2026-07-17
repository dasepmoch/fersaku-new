package jobs

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
)

// Deps wires domain services available to lifecycle jobs.
// Nil service → registered no-op stub with log once at wire time.
type Deps struct {
	Pool          *pgxpool.Pool
	Log           ports.Logger
	Clock         ports.Clock
	Owner         string
	Coupons       *application.CouponService
	Inventory     *application.InventoryService
	Objects       *application.ObjectService
	Checkout      *application.CheckoutService
	Domains       *application.DomainService
	Withdrawals   *application.WithdrawalService
	Notifications *application.NotificationService
	Callbacks     *application.CallbackService
	Webhooks      *application.WebhookService
	Ledger        *application.LedgerService
	Analytics     *application.AnalyticsService
	Impersonation *application.ImpersonationService
}

// BuildRegistry registers the full INT-185 inventory with real runners or no-op stubs.
func BuildRegistry(d Deps) *Registry {
	reg := NewRegistry()
	owner := d.Owner
	if owner == "" {
		owner = "fersaku-worker"
	}
	meta := map[JobName]JobMeta{}
	for _, m := range DefaultInventory() {
		meta[m.Name] = m
	}
	must := func(name JobName) JobMeta {
		if m, ok := meta[name]; ok {
			return m
		}
		return JobMeta{Name: name, Cadence: 30 * time.Second, BatchSize: 50, Timeout: 30 * time.Second, LeaseTTL: 45 * time.Second}
	}
	stub := func(name JobName, reason string) {
		m := must(name)
		if d.Log != nil {
			d.Log.Info("job registered as no-op stub", "job", string(name), "reason", reason)
		}
		reg.Register(m, func(context.Context, int) (int, error) { return 0, nil })
	}

	// coupon reservation expiry
	if d.Coupons != nil {
		reg.Register(must(JobCouponReservationExpiry), func(ctx context.Context, batch int) (int, error) {
			return d.Coupons.ExpireReservations(ctx, int32(batch))
		})
	} else {
		stub(JobCouponReservationExpiry, "CouponService missing")
	}

	// inventory reservation expiry
	if d.Inventory != nil {
		reg.Register(must(JobInventoryReservationExpiry), func(ctx context.Context, batch int) (int, error) {
			return d.Inventory.ExpireReservations(ctx, int32(batch))
		})
	} else {
		stub(JobInventoryReservationExpiry, "InventoryService missing")
	}

	// object upload cleanup
	if d.Objects != nil {
		reg.Register(must(JobObjectUploadCleanup), func(ctx context.Context, batch int) (int, error) {
			return d.Objects.CleanupExpiredUploads(ctx, int32(batch))
		})
	} else {
		stub(JobObjectUploadCleanup, "ObjectService missing")
	}

	// checkout intent expiry + unknown reconciliation
	if d.Checkout != nil && d.Pool != nil {
		reg.Register(must(JobCheckoutIntentExpiry), func(ctx context.Context, batch int) (int, error) {
			return expireDueCheckoutIntents(ctx, d, batch)
		})
		reg.Register(must(JobCheckoutUnknownReconciliation), func(ctx context.Context, batch int) (int, error) {
			return reconcileUnknownCheckoutIntents(ctx, d, batch)
		})
	} else {
		stub(JobCheckoutIntentExpiry, "CheckoutService or pool missing")
		stub(JobCheckoutUnknownReconciliation, "CheckoutService or pool missing")
	}

	// domain revalidation
	if d.Domains != nil {
		reg.Register(must(JobDomainRevalidation), func(ctx context.Context, batch int) (int, error) {
			return d.Domains.RevalidateDue(ctx, int32(batch))
		})
	} else {
		stub(JobDomainRevalidation, "DomainService missing")
	}

	// withdrawal quote expiry + unknown lookup
	if d.Withdrawals != nil && d.Pool != nil {
		reg.Register(must(JobWithdrawalQuoteExpiry), func(ctx context.Context, batch int) (int, error) {
			return expireWithdrawalQuotes(ctx, d, batch)
		})
		reg.Register(must(JobWithdrawalUnknownLookup), func(ctx context.Context, batch int) (int, error) {
			return d.Withdrawals.ResolveDueUnknowns(ctx, int32(batch))
		})
	} else if d.Withdrawals != nil {
		stub(JobWithdrawalQuoteExpiry, "pool missing for quote expiry SQL")
		reg.Register(must(JobWithdrawalUnknownLookup), func(ctx context.Context, batch int) (int, error) {
			return d.Withdrawals.ResolveDueUnknowns(ctx, int32(batch))
		})
	} else {
		stub(JobWithdrawalQuoteExpiry, "WithdrawalService missing")
		stub(JobWithdrawalUnknownLookup, "WithdrawalService missing")
	}

	// notification outbox + retention
	if d.Notifications != nil && d.Pool != nil {
		nw := &NotificationWorker{Pool: d.Pool, Svc: d.Notifications, Log: d.Log, Owner: owner + ":notif"}
		reg.Register(must(JobNotificationOutbox), func(ctx context.Context, batch int) (int, error) {
			return nw.ProcessReady(ctx, batch)
		})
		reg.Register(must(JobNotificationRetention), func(ctx context.Context, batch int) (int, error) {
			return purgeNotifications(ctx, d, batch)
		})
	} else {
		stub(JobNotificationOutbox, "NotificationService or pool missing")
		stub(JobNotificationRetention, "NotificationService or pool missing")
	}

	// provider callback outbox
	if d.Callbacks != nil && d.Pool != nil {
		cw := &CallbackWorker{Pool: d.Pool, Svc: d.Callbacks, Log: d.Log, Owner: owner + ":cb"}
		reg.Register(must(JobProviderCallbackOutbox), func(ctx context.Context, batch int) (int, error) {
			return cw.ProcessReady(ctx, batch)
		})
	} else {
		stub(JobProviderCallbackOutbox, "CallbackService or pool missing")
	}

	// seller webhook outbox
	if d.Webhooks != nil && d.Pool != nil {
		ww := &WebhookWorker{Pool: d.Pool, Svc: d.Webhooks, Log: d.Log, Owner: owner + ":wh"}
		reg.Register(must(JobSellerWebhookOutbox), func(ctx context.Context, batch int) (int, error) {
			return ww.ProcessReady(ctx, batch)
		})
	} else {
		stub(JobSellerWebhookOutbox, "WebhookService or pool missing")
	}

	// settlement release
	if d.Ledger != nil {
		reg.Register(must(JobSettlementRelease), func(ctx context.Context, batch int) (int, error) {
			return d.Ledger.ReleaseDueSettlements(ctx, int32(batch))
		})
	} else {
		stub(JobSettlementRelease, "LedgerService missing")
	}

	// analytics retention
	if d.Analytics != nil {
		reg.Register(must(JobAnalyticsRetention), func(ctx context.Context, _ int) (int, error) {
			if err := d.Analytics.RunRetentionDeletion(ctx); err != nil {
				return 0, err
			}
			return 1, nil
		})
	} else {
		stub(JobAnalyticsRetention, "AnalyticsService missing")
	}

	// sessions / challenges cleanup
	if d.Pool != nil {
		reg.Register(must(JobSessionCleanup), func(ctx context.Context, batch int) (int, error) {
			return cleanupSessionsAndChallenges(ctx, d, batch)
		})
		reg.Register(must(JobIdempotencyCleanup), func(ctx context.Context, batch int) (int, error) {
			return cleanupIdempotency(ctx, d, batch)
		})
	} else {
		stub(JobSessionCleanup, "pool missing")
		stub(JobIdempotencyCleanup, "pool missing")
	}

	// impersonation expiry
	if d.Pool != nil {
		reg.Register(must(JobImpersonationExpiry), func(ctx context.Context, batch int) (int, error) {
			return expireImpersonationSessions(ctx, d, batch)
		})
	} else {
		stub(JobImpersonationExpiry, "pool missing")
	}

	return reg
}

func nowOf(d Deps) time.Time {
	if d.Clock != nil {
		return d.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

// expireDueCheckoutIntents finds expired pending intents and calls ExpireIntent (idempotent).
func expireDueCheckoutIntents(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 25
	}
	now := nowOf(d)
	// Claim batch under transaction so FOR UPDATE SKIP LOCKED is multi-replica safe.
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `
		SELECT id FROM payment_intents
		WHERE status IN ('REQUIRES_PAYMENT', 'PENDING')
		  AND expires_at <= $1
		ORDER BY expires_at ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`,
		now, limit,
	)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		_, _, err := d.Checkout.ExpireIntent(ctx, application.ExpireIntentRequest{
			IntentID:       id,
			IdempotencyKey: "worker-expire:" + id,
			Reason:         "ttl_elapsed",
		})
		if err != nil {
			if d.Log != nil {
				d.Log.Warn("checkout expire intent", "intent_id", id, "err", err.Error())
			}
			continue
		}
		n++
	}
	return n, nil
}

// reconcileUnknownCheckoutIntents looks up provider state for UNKNOWN_OUTCOME / scheduled lookups.
func reconcileUnknownCheckoutIntents(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 20
	}
	now := nowOf(d)
	tx, err := d.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `
		SELECT id FROM payment_intents
		WHERE status IN ('UNKNOWN_OUTCOME', 'EXPIRE_PENDING', 'CANCEL_PENDING')
		  AND (lookup_scheduled_at IS NULL OR lookup_scheduled_at <= $1)
		ORDER BY COALESCE(lookup_scheduled_at, updated_at) ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED`,
		now, limit,
	)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		if _, err := d.Checkout.LookupProvider(ctx, id); err != nil {
			if d.Log != nil {
				d.Log.Warn("checkout lookup provider", "intent_id", id, "err", err.Error())
			}
			continue
		}
		next := now.Add(30 * time.Second)
		_, _ = d.Pool.Exec(ctx, `
			UPDATE payment_intents
			SET lookup_scheduled_at = $2,
			    lookup_attempts = COALESCE(lookup_attempts, 0) + 1,
			    updated_at = $3
			WHERE id = $1
			  AND status IN ('UNKNOWN_OUTCOME', 'EXPIRE_PENDING', 'CANCEL_PENDING')`,
			id, next, now,
		)
		n++
	}
	return n, nil
}

func expireWithdrawalQuotes(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	now := nowOf(d)
	tag, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM withdrawal_quotes
			WHERE status = 'ACTIVE' AND expires_at <= $1
			ORDER BY expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		UPDATE withdrawal_quotes q
		SET status = 'EXPIRED', updated_at = $1
		FROM due
		WHERE q.id = due.id`,
		now, limit,
	)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func purgeNotifications(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 500
	}
	// STANDARD: 90d; SECURITY/COMPLIANCE retained longer (not purged here).
	now := nowOf(d)
	cutoffStd := now.Add(-90 * 24 * time.Hour)
	tag, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM notifications
			WHERE retention_class = 'STANDARD'
			  AND created_at < $1
			ORDER BY created_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM notifications n
		USING due
		WHERE n.id = due.id`,
		cutoffStd, limit,
	)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func cleanupSessionsAndChallenges(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 500
	}
	now := nowOf(d)
	// Sessions: hard-delete revoked or past absolute expiry older than 7 days.
	cutoff := now.Add(-7 * 24 * time.Hour)
	tag1, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM auth_sessions
			WHERE (revoked_at IS NOT NULL AND revoked_at < $1)
			   OR (absolute_expires_at < $1)
			ORDER BY absolute_expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM auth_sessions s
		USING due
		WHERE s.id = due.id`,
		cutoff, limit,
	)
	if err != nil {
		return 0, err
	}
	tag2, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM auth_challenges
			WHERE (consumed_at IS NOT NULL AND consumed_at < $1)
			   OR (expires_at < $1)
			ORDER BY expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM auth_challenges c
		USING due
		WHERE c.id = due.id`,
		cutoff, limit,
	)
	if err != nil {
		return int(tag1.RowsAffected()), err
	}
	// MFA recent proofs (migration 000029).
	tag3, _ := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM mfa_recent_proofs
			WHERE expires_at < $1
			ORDER BY expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM mfa_recent_proofs p
		USING due
		WHERE p.id = due.id`,
		now, limit,
	)
	return int(tag1.RowsAffected() + tag2.RowsAffected() + tag3.RowsAffected()), nil
}

func cleanupIdempotency(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 1000
	}
	now := nowOf(d)
	tag, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM idempotency_records
			WHERE expires_at < $1
			ORDER BY expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		DELETE FROM idempotency_records r
		USING due
		WHERE r.id = due.id`,
		now, limit,
	)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

func expireImpersonationSessions(ctx context.Context, d Deps, limit int) (int, error) {
	if limit <= 0 {
		limit = 100
	}
	now := nowOf(d)
	// Bulk expire; derived session revoke remains best-effort on ResolveDerived.
	tag, err := d.Pool.Exec(ctx, `
		WITH due AS (
			SELECT id FROM impersonation_sessions
			WHERE status = 'ACTIVE'
			  AND ended_at IS NULL
			  AND expires_at <= $1
			ORDER BY expires_at ASC
			LIMIT $2
			FOR UPDATE SKIP LOCKED
		)
		UPDATE impersonation_sessions s
		SET status = 'EXPIRED',
		    ended_at = $1,
		    end_reason = COALESCE(end_reason, 'expired'),
		    updated_at = $1
		FROM due
		WHERE s.id = due.id`,
		now, limit,
	)
	if err != nil {
		return 0, fmt.Errorf("impersonation expiry: %w", err)
	}
	_ = d.Impersonation
	return int(tag.RowsAffected()), nil
}
