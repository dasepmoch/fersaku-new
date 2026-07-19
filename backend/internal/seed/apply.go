package seed

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Result summarizes a successful seed run.
type Result struct {
	AppEnv    string
	Clock     time.Time
	Personas  []Persona
	Resources map[string]string
	Marker    string
}

// Apply inserts the full deterministic nonprod fixture set.
// Idempotent: deletes prior QLT-110 rows (by known IDs) then re-inserts.
func Apply(ctx context.Context, pool *pgxpool.Pool) (Result, error) {
	if err := GuardNonProduction(); err != nil {
		return Result{}, err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("seed: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := wipeSeedRows(ctx, tx); err != nil {
		return Result{}, err
	}
	res, err := insertAll(ctx, tx)
	if err != nil {
		return Result{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Result{}, fmt.Errorf("seed: commit: %w", err)
	}
	res.AppEnv = AppEnv()
	res.Clock = FixedClock
	res.Personas = Personas()
	return res, nil
}

func wipeSeedRows(ctx context.Context, tx pgx.Tx) error {
	// session_replication_role=replica skips user triggers (last-store guards) for seed wipe only.
	// Scope remains explicit seed ID lists — never wildcard shared DBs.
	if _, err := tx.Exec(ctx, `SET LOCAL session_replication_role = replica`); err != nil {
		return fmt.Errorf("seed: set session_replication_role: %w", err)
	}

	allIDs := seedIDList()
	merchantIDs := []string{ID(IDMerchantA), ID(IDMerchantB), ID(IDMerchantEmpty)}
	storeIDs := []string{ID(IDStoreA), ID(IDStoreB), ID(IDStoreEmpty)}
	userIDs := []string{
		ID(IDUserBuyerA), ID(IDUserBuyerB), ID(IDUserSellerOwnerA), ID(IDUserSellerMemberRead),
		ID(IDUserSellerB), ID(IDUserAdminSuper), ID(IDUserAdminSupport), ID(IDUserAdminFinance),
		ID(IDUserAdminNoAccess),
	}
	wdIDs := []string{ID(IDWDPending), ID(IDWDProcessing), ID(IDWDUnknown), ID(IDWDCompleted)}
	kycIDs := []string{ID(IDKYCDraft), ID(IDKYCSubmitted), ID(IDKYCNeedsInfo), ID(IDKYCApproved), ID(IDKYCRejected)}

	type step struct {
		sql string
		arg any
	}
	steps := []step{
		{`DELETE FROM webhook_dead_letters WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM webhook_delivery_attempts WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM webhook_deliveries WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM seller_webhook_endpoints WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM product_review_reports WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM product_review_replies WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM product_reviews WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM invoice_versions WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM invoices WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM delivery_attempts WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM delivery_grants WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM payment_settlements WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM payment_provider_events WHERE callback_id = ANY($1)`, allIDs},
		{`DELETE FROM provider_callback_rejections WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM payment_intents WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM order_items WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM orders WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM stock_reservations WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM stock_items WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM inventory_schemas WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM coupon_reservations WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM coupons WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM withdrawal_allocations WHERE withdrawal_id = ANY($1)`, wdIDs},
		{`DELETE FROM withdrawals WHERE id = ANY($1)`, wdIDs},
		{`DELETE FROM withdrawal_quotes WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM merchant_withdrawal_locks WHERE merchant_id = ANY($1)`, merchantIDs},
		{`DELETE FROM bank_accounts WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM kyc_case_transitions WHERE case_id = ANY($1)`, kycIDs},
		{`DELETE FROM kyc_documents WHERE case_id = ANY($1)`, kycIDs},
		{`DELETE FROM kyc_cases WHERE id = ANY($1)`, kycIDs},
		{`DELETE FROM merchant_balances WHERE merchant_id = ANY($1)`, merchantIDs},
		{`DELETE FROM merchant_balance_sources WHERE merchant_id = ANY($1)`, merchantIDs},
		{`DELETE FROM fee_snapshots WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM notifications WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM auth_sessions WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM mfa_factors WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM products WHERE id = ANY($1)`, allIDs},
		{`DELETE FROM storefront_revisions WHERE store_id = ANY($1)`, storeIDs},
		{`DELETE FROM merchant_members WHERE merchant_id = ANY($1)`, merchantIDs},
		{`DELETE FROM stores WHERE id = ANY($1)`, storeIDs},
		{`DELETE FROM merchants WHERE id = ANY($1)`, merchantIDs},
		{`DELETE FROM user_notification_preferences WHERE user_id = ANY($1)`, userIDs},
		{`DELETE FROM user_profiles WHERE user_id = ANY($1)`, userIDs},
		{`DELETE FROM user_roles WHERE user_id = ANY($1)`, userIDs},
		{`DELETE FROM users WHERE id = ANY($1)`, userIDs},
		// Audit chain is append-only via triggers; only delete our known seed event id when role=replica.
		{`DELETE FROM audit_events WHERE id = ANY($1)`, []string{ID(IDAuditSeedNote)}},
	}

	for _, s := range steps {
		if _, err := tx.Exec(ctx, s.sql, s.arg); err != nil {
			return fmt.Errorf("seed: wipe %q: %w", s.sql, err)
		}
	}
	return nil
}

func contains(s, sub string) bool {
	return strings.Contains(s, sub)
}

func seedIDList() []string {
	// Broad list covering resource IDs used in seed inserts.
	out := make([]string, 0, 220)
	for i := 1; i <= 220; i++ {
		out = append(out, ID(i))
	}
	return out
}

func insertAll(ctx context.Context, tx pgx.Tx) (Result, error) {
	pw := PasswordHash()
	now := FixedClock
	res := Result{Resources: map[string]string{}}

	// --- Users + roles + profiles ---
	for _, p := range Personas() {
		verified := now.Add(-24 * time.Hour)
		_, err := tx.Exec(ctx, `
INSERT INTO users (
  id, email_normalized, email_display, password_hash, name, status,
  email_verified_at, mfa_enabled, last_login_at, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, 'ACTIVE',
  $6, $7, $8, $9, $9
)`, p.UserID, p.Email, p.EmailDisplay, pw, p.Name,
			verified, p.MFAEnabled, now.Add(-time.Hour), now)
		if err != nil {
			return res, fmt.Errorf("seed: user %s: %w", p.Key, err)
		}
		for _, roleID := range p.Roles {
			_, err = tx.Exec(ctx, `
INSERT INTO user_roles (user_id, role_id, assigned_at)
VALUES ($1, $2, $3)`, p.UserID, roleID, now.Add(-24*time.Hour))
			if err != nil {
				return res, fmt.Errorf("seed: role %s/%s: %w", p.Key, roleID, err)
			}
		}
		_, err = tx.Exec(ctx, `
INSERT INTO user_profiles (user_id, display_name, phone, locale, timezone, version, updated_at)
VALUES ($1, $2, '', 'id-ID', 'Asia/Jakarta', 1, $3)`,
			p.UserID, p.Name, now)
		if err != nil {
			return res, fmt.Errorf("seed: profile %s: %w", p.Key, err)
		}
		// Default prefs for buyer A only (notification scenario)
		if p.Key == PersonaBuyerA {
			for _, ev := range []string{"PAYMENT_RECEIPT", "SECURITY_ALERT"} {
				for _, ch := range []string{"EMAIL", "IN_APP"} {
					_, err = tx.Exec(ctx, `
INSERT INTO user_notification_preferences (user_id, event_code, channel, enabled, updated_at)
VALUES ($1, $2, $3, true, $4)`, p.UserID, ev, ch, now)
					if err != nil {
						return res, fmt.Errorf("seed: pref: %w", err)
					}
				}
			}
		}
		res.Resources["persona."+p.Key+".user_id"] = p.UserID
		res.Resources["persona."+p.Key+".email"] = p.Email
	}

	// Sessions (token hashes only — raw tokens never stored).
	sessExpires := now.Add(7 * 24 * time.Hour)
	var err error
	for _, s := range []struct {
		id, user, surface, label string
	}{
		{ID(IDSessionBuyerA), ID(IDUserBuyerA), "BUYER", "buyer-a-session"},
		{ID(IDSessionAdminSuper), ID(IDUserAdminSuper), "ADMIN", "admin-super-session"},
	} {
		_, err = tx.Exec(ctx, `
INSERT INTO auth_sessions (
  id, user_id, surface, token_hash, expires_at, revoked_at, mfa_verified_at,
  last_seen_at, absolute_expires_at, ip_hash, ua_hash, device_label, csrf_token_hash, created_at
) VALUES (
  $1, $2, $3, $4, $5, NULL, $6,
  $7, $8, $9, $10, $11, $12, $13
)`, s.id, s.user, s.surface, TokenHash(s.label), sessExpires,
			now.Add(-time.Hour), now, now.Add(30*24*time.Hour),
			TokenHash(s.label+"-ip"), TokenHash(s.label+"-ua"), "seed-device",
			TokenHash(s.label+"-csrf"), now.Add(-2*time.Hour))
		if err != nil {
			return res, fmt.Errorf("seed: session %s: %w", s.label, err)
		}
		res.Resources["session."+s.label] = s.id
	}

	// --- Merchants / stores ---
	type merch struct {
		mid, owner, name, slug, storeID string
		onboardingComplete              bool
		empty                           bool
	}
	merchants := []merch{
		{ID(IDMerchantA), ID(IDUserSellerOwnerA), "Seed Merchant A", "seed-store-a", ID(IDStoreA), true, false},
		{ID(IDMerchantB), ID(IDUserSellerB), "Seed Merchant B", "seed-store-b", ID(IDStoreB), true, false},
		{ID(IDMerchantEmpty), ID(IDUserSellerOwnerA), "Seed Empty Merchant", "seed-store-empty", ID(IDStoreEmpty), false, true},
	}
	// Empty merchant needs distinct owner — use seller B as owner of empty? Better: seller owner A owns only A.
	// Empty store scenario: second merchant owned by seller B is isolation; empty is new store under A would break one-canonical.
	// Use seller B's second store? Schema: one canonical per merchant. Empty = merchant with complete=false and no products.
	// Owner of empty merchant: create as seller B's second merchant is fine if owner is seller B.
	merchants[2].owner = ID(IDUserSellerB)

	for _, m := range merchants {
		state := "COMPLETE"
		var completed *time.Time
		if m.onboardingComplete {
			t := now.Add(-72 * time.Hour)
			completed = &t
		} else {
			state = "NOT_STARTED"
		}
		_, err = tx.Exec(ctx, `
INSERT INTO merchants (
  id, owner_user_id, display_name, status, legal_name, business_type,
  onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
  created_at, updated_at
) VALUES (
  $1, $2, $3, 'ACTIVE', $4, 'INDIVIDUAL',
  $5, $5, $6, '{}'::jsonb, $7, $7
)`, m.mid, m.owner, m.name, m.name, state, completed, now.Add(-100*time.Hour))
		if err != nil {
			return res, fmt.Errorf("seed: merchant %s: %w", m.mid, err)
		}
		storeState := state
		storeName := m.name + " Store"
		if m.empty {
			storeName = "Seed Empty Store"
		}
		_, err = tx.Exec(ctx, `
INSERT INTO stores (
  id, merchant_id, slug, name, status, is_canonical,
  bio, address, accent_color,
  onboarding_state, onboarding_step, onboarding_completed_at, onboarding_progress,
  storefront_revision, published_revision, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, 'ACTIVE', true,
  $5, 'Jakarta, ID', '#2563eb',
  $6, $6, $7, '{}'::jsonb,
  1, 0, $8, $8
)`, m.storeID, m.mid, m.slug, storeName, "Seed bio for "+m.slug,
			storeState, completed, now.Add(-100*time.Hour))
		if err != nil {
			return res, fmt.Errorf("seed: store %s: %w", m.storeID, err)
		}
		res.Resources["merchant."+m.slug] = m.mid
		res.Resources["store."+m.slug] = m.storeID
	}

	// Memberships: owner A + staff member on merchant A; owner B on merchant B; owner B on empty
	members := []struct {
		mid, uid, role string
	}{
		{ID(IDMerchantA), ID(IDUserSellerOwnerA), "OWNER"},
		{ID(IDMerchantA), ID(IDUserSellerMemberRead), "STAFF"},
		{ID(IDMerchantB), ID(IDUserSellerB), "OWNER"},
		{ID(IDMerchantEmpty), ID(IDUserSellerB), "OWNER"},
	}
	for _, m := range members {
		_, err = tx.Exec(ctx, `
INSERT INTO merchant_members (merchant_id, user_id, role_in_merchant, status, created_at)
VALUES ($1, $2, $3, 'ACTIVE', $4)`, m.mid, m.uid, m.role, now.Add(-90*time.Hour))
		if err != nil {
			return res, fmt.Errorf("seed: member: %w", err)
		}
	}

	// --- Products (store A + store B isolation) ---
	type prod struct {
		id, store, merchant, slug, title, status string
		price                                    int64
		published                                *time.Time
	}
	pub := now.Add(-48 * time.Hour)
	products := []prod{
		{ID(IDProductDraft), ID(IDStoreA), ID(IDMerchantA), "seed-draft-product", "Seed Draft Product", "draft", 25000, nil},
		{ID(IDProductPublished), ID(IDStoreA), ID(IDMerchantA), "seed-published-product", "Seed Published Product", "published", 50000, &pub},
		{ID(IDProductArchived), ID(IDStoreA), ID(IDMerchantA), "seed-archived-product", "Seed Archived Product", "archived", 15000, nil},
		{ID(IDProductSellerB), ID(IDStoreB), ID(IDMerchantB), "seed-seller-b-product", "Seed Seller B Product", "published", 40000, &pub},
	}
	for _, p := range products {
		_, err = tx.Exec(ctx, `
INSERT INTO products (
  id, store_id, merchant_id, slug, title, short, description, price_idr, type, status,
  version, badge, palette, glyph, includes, allow_pwyt, published_at, created_at, updated_at,
  active_schema_version
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, 'code', $9,
  '1.0.0', '', '', '', '[]'::jsonb, false, $10, $11, $11,
  CASE WHEN $9 = 'published' AND $2 = $12 THEN 1 ELSE NULL END
)`, p.id, p.store, p.merchant, p.slug, p.title, p.title, "Seed description",
			p.price, p.status, p.published, now.Add(-60*time.Hour), ID(IDStoreA))
		if err != nil {
			return res, fmt.Errorf("seed: product %s: %w", p.slug, err)
		}
		res.Resources["product."+p.slug] = p.id
	}

	// Inventory schema + stock states for published product A
	_, err = tx.Exec(ctx, `
INSERT INTO inventory_schemas (
  id, product_id, store_id, merchant_id, version, fields, delimiter, checksum, created_by, created_at
) VALUES (
  $1, $2, $3, $4, 1, '[{"name":"code","type":"string"}]'::jsonb, ',', $5, $6, $7
)`, ID(IDInvSchema), ID(IDProductPublished), ID(IDStoreA), ID(IDMerchantA),
		TokenHash("inv-schema-v1"), ID(IDUserSellerOwnerA), now.Add(-50*time.Hour))
	if err != nil {
		return res, fmt.Errorf("seed: inv schema: %w", err)
	}
	res.Resources["inventory.schema"] = ID(IDInvSchema)

	stocks := []struct {
		id, status                   string
		reserved, delivered, revoked *time.Time
	}{
		{ID(IDStockAvailable), "AVAILABLE", nil, nil, nil},
		{ID(IDStockReserved), "RESERVED", ptr(now.Add(-2 * time.Hour)), nil, nil},
		{ID(IDStockDelivered), "DELIVERED", ptr(now.Add(-30 * time.Hour)), ptr(now.Add(-29 * time.Hour)), nil},
		{ID(IDStockRevoked), "REVOKED", nil, nil, ptr(now.Add(-10 * time.Hour))},
	}
	for i, s := range stocks {
		_, err = tx.Exec(ctx, `
INSERT INTO stock_items (
  id, product_id, store_id, merchant_id, schema_version, status,
  encrypted_payload, key_version, masked_preview, unique_key_hash,
  created_by, created_at, updated_at, reserved_at, delivered_at, revoked_at
) VALUES (
  $1, $2, $3, $4, 1, $5,
  $6, 'v1', '{"code":"****"}'::jsonb, $7,
  $8, $9, $9, $10, $11, $12
)`, s.id, ID(IDProductPublished), ID(IDStoreA), ID(IDMerchantA), s.status,
			FakeCiphertext(fmt.Sprintf("stock-%d", i)), TokenHash(fmt.Sprintf("stock-uk-%d", i)),
			ID(IDUserSellerOwnerA), now.Add(-45*time.Hour), s.reserved, s.delivered, s.revoked)
		if err != nil {
			return res, fmt.Errorf("seed: stock %s: %w", s.status, err)
		}
		res.Resources["stock."+s.status] = s.id
	}
	// "invalid" inventory: no row with illegal status; document as intentionally absent
	res.Resources["stock.INVALID"] = "" // not insertable; isolation tests treat missing as invalid

	// Reservations for reserved + delivered stock
	_, err = tx.Exec(ctx, `
INSERT INTO stock_reservations (
  id, stock_item_id, product_id, store_id, merchant_id, order_id, checkout_id,
  idempotency_key, status, expires_at, released_at, delivered_at, created_at, updated_at
) VALUES
(
  $1, $2, $3, $4, $5, $6, NULL,
  'seed-resv-active', 'RESERVED', $7, NULL, NULL, $8, $8
),
(
  $9, $10, $3, $4, $5, $11, NULL,
  'seed-resv-delivered', 'DELIVERED', $12, NULL, $13, $14, $14
)`,
		ID(IDResvActive), ID(IDStockReserved), ID(IDProductPublished), ID(IDStoreA), ID(IDMerchantA),
		ID(IDOrderPending), now.Add(2*time.Hour), now.Add(-2*time.Hour),
		ID(IDResvDelivered), ID(IDStockDelivered), ID(IDOrderPaid),
		now.Add(-28*time.Hour), now.Add(-29*time.Hour), now.Add(-30*time.Hour))
	if err != nil {
		return res, fmt.Errorf("seed: reservations: %w", err)
	}

	// Fee snapshots
	_, err = tx.Exec(ctx, `
INSERT INTO fee_snapshots (
  id, policy_version_id, scope, kind, payment_source, gross_or_amount_idr,
  percent_bps, percent_component_idr, fixed_component_idr, provider_fee_idr,
  total_fee_idr, net_idr, currency, checksum, created_at
) VALUES
(
  $1, 'LAUNCH_FEE_POLICY_V1', 'GLOBAL', 'TRANSACTION', 'STOREFRONT', 50000,
  300, 1500, 700, 0, 2200, 47800, 'IDR', $2, $3
),
(
  $4, 'LAUNCH_FEE_POLICY_V1', 'GLOBAL', 'WITHDRAWAL', NULL, 100000,
  300, 3000, 0, 2500, 5500, 94500, 'IDR', $5, $3
)`, ID(IDFeeSnapTx), TokenHash("fee-tx"), now.Add(-40*time.Hour),
		ID(IDFeeSnapWD), TokenHash("fee-wd"))
	if err != nil {
		return res, fmt.Errorf("seed: fee snapshots: %w", err)
	}

	// --- Orders + payments ---
	if err := seedOrdersPayments(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedDelivery(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedCoupons(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedReviews(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedFinance(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedKYC(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedCallbacksWebhooks(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}
	if err := seedNotificationsAudit(ctx, tx, now, res.Resources); err != nil {
		return res, err
	}

	// Marker in schema_meta
	_, err = tx.Exec(ctx, `
INSERT INTO schema_meta (key, value, updated_at) VALUES
  ('qlt110_seed', $1, $2)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
		FixedClock.Format(time.RFC3339), now)
	if err != nil {
		return res, fmt.Errorf("seed: marker: %w", err)
	}
	res.Marker = "qlt110_seed@" + FixedClock.Format(time.RFC3339)

	// Emergency controls already migration-seeded; bump versions for versioned control scenario
	_, err = tx.Exec(ctx, `
UPDATE platform_emergency_controls
SET version = 2, reason = 'qlt110 seed version bump', updated_at = $1, effective_at = $1
WHERE switch_name = 'QRIS_CHECKOUT'`, now)
	if err != nil {
		return res, fmt.Errorf("seed: emergency: %w", err)
	}
	res.Resources["emergency.QRIS_CHECKOUT.version"] = "2"

	return res, nil
}

func ptr(t time.Time) *time.Time { return &t }

func seedOrdersPayments(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	type ord struct {
		id, number, payStatus, orderStatus string
		buyer                              *string
		email                              string
		paidAt                             *time.Time
		gross                              int64
		expires                            *time.Time
	}
	buyerA := ID(IDUserBuyerA)
	paidAt := now.Add(-29 * time.Hour)
	expPast := now.Add(-3 * time.Hour)
	expFuture := now.Add(2 * time.Hour)
	orders := []ord{
		{ID(IDOrderPaid), "SEED-ORD-PAID-001", "PAID", "FULFILLED", &buyerA, "buyer.a@seed.fersaku.test", &paidAt, 50000, nil},
		{ID(IDOrderPending), "SEED-ORD-PEND-001", "PENDING_PAYMENT", "PENDING_PAYMENT", &buyerA, "buyer.a@seed.fersaku.test", nil, 50000, &expFuture},
		{ID(IDOrderExpired), "SEED-ORD-EXP-001", "EXPIRED", "EXPIRED", &buyerA, "buyer.a@seed.fersaku.test", nil, 50000, &expPast},
		{ID(IDOrderFailed), "SEED-ORD-FAIL-001", "FAILED", "FAILED", &buyerA, "buyer.a@seed.fersaku.test", nil, 50000, nil},
		{ID(IDOrderSellerB), "SEED-ORD-B-001", "PAID", "FULFILLED", nil, "guest@seed.fersaku.test", &paidAt, 40000, nil},
	}
	for _, o := range orders {
		mid, sid := ID(IDMerchantA), ID(IDStoreA)
		if o.id == ID(IDOrderSellerB) {
			mid, sid = ID(IDMerchantB), ID(IDStoreB)
		}
		_, err := tx.Exec(ctx, `
INSERT INTO orders (
  id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
  payment_status, order_status, source, currency,
  subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
  paid_at, payment_mode, fee_snapshot_id, expires_at, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, 'Seed Buyer',
  $7, $8, 'STOREFRONT', 'IDR',
  $9, 0, 0, 2200, $9, $10,
  $11, 'SANDBOX', $12, $13, $14, $14
)`, o.id, o.number, sid, mid, o.buyer, o.email,
			o.payStatus, o.orderStatus, o.gross, o.gross-2200,
			o.paidAt, ID(IDFeeSnapTx), o.expires, now.Add(-35*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: order %s: %w", o.number, err)
		}
		res["order."+o.number] = o.id
	}

	// Order items
	items := []struct {
		id, order, product, title string
		price                     int64
		stockResv, stockItem      *string
	}{
		{ID(IDOrderItemPaid), ID(IDOrderPaid), ID(IDProductPublished), "Seed Published Product", 50000, ptrS(ID(IDResvDelivered)), ptrS(ID(IDStockDelivered))},
		{ID(IDOrderItemPending), ID(IDOrderPending), ID(IDProductPublished), "Seed Published Product", 50000, ptrS(ID(IDResvActive)), ptrS(ID(IDStockReserved))},
		{ID(IDOrderItemSB), ID(IDOrderSellerB), ID(IDProductSellerB), "Seed Seller B Product", 40000, nil, nil},
	}
	for _, it := range items {
		mid, sid := ID(IDMerchantA), ID(IDStoreA)
		if it.order == ID(IDOrderSellerB) {
			mid, sid = ID(IDMerchantB), ID(IDStoreB)
		}
		_, err := tx.Exec(ctx, `
INSERT INTO order_items (
  id, order_id, store_id, merchant_id, product_id, product_version, product_title, product_type,
  unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr, line_total_idr,
  delivery_kind, stock_reservation_id, stock_item_id, created_at
) VALUES (
  $1, $2, $3, $4, $5, '1.0.0', $6, 'code',
  $7, 1, $7, 0, $7, 'CODE', $8, $9, $10
)`, it.id, it.order, sid, mid, it.product, it.title, it.price, it.stockResv, it.stockItem, now.Add(-35*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: order_item: %w", err)
		}
		res["order_item."+it.id] = it.id
	}

	// Payment intents: pending/paid/expired/failed/unknown
	type pi struct {
		id, order, status string
		amount            int64
		exp               time.Time
		provRef           *string
	}
	refPaid := "seed-xendit-paid-001"
	payments := []pi{
		{ID(IDPaymentPending), ID(IDOrderPending), "PENDING", 50000, now.Add(2 * time.Hour), nil},
		{ID(IDPaymentPaid), ID(IDOrderPaid), "PAID", 50000, now.Add(-28 * time.Hour), &refPaid},
		{ID(IDPaymentExpired), ID(IDOrderExpired), "EXPIRED", 50000, now.Add(-3 * time.Hour), nil},
		{ID(IDPaymentFailed), ID(IDOrderFailed), "FAILED", 50000, now.Add(-4 * time.Hour), nil},
		{ID(IDPaymentUnknown), ID(IDOrderPending), "UNKNOWN_OUTCOME", 50000, now.Add(1 * time.Hour), nil},
	}
	// payment_intents unique on order_id — cannot put unknown on same pending order.
	// Create a dedicated unpaid order for unknown? Simpler: skip second intent on pending;
	// use failed order only for failed; for unknown use a synthetic order by reusing expired order — also unique.
	// Fix: only one intent per order. Map:
	// pending->pending, paid->paid, expired->expired, failed->failed.
	// unknown: insert on seller B order is paid already. Add dedicated order for unknown.
	// We'll only insert first four + change unknown to use a separate approach: update not needed —
	// insert payment for seller B as PAID and document UNKNOWN via provider event only.
	// QLT requires unknown payment: add order UNPAID for unknown intent.
	// Insert extra order for unknown (order_id unique on payment_intents).
	unknownOrderID := ID(110)
	buyerAID := ID(IDUserBuyerA)
	_, err := tx.Exec(ctx, `
INSERT INTO orders (
  id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
  payment_status, order_status, source, currency,
  subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
  payment_mode, created_at, updated_at
) VALUES (
  $1, 'SEED-ORD-UNK-001', $2, $3, $4, 'buyer.a@seed.fersaku.test', 'Seed Buyer',
  'PENDING_PAYMENT', 'PENDING_PAYMENT', 'STOREFRONT', 'IDR',
  50000, 0, 0, 2200, 50000, 47800,
  'SANDBOX', $5, $5
)`, unknownOrderID, ID(IDStoreA), ID(IDMerchantA), buyerAID, now.Add(-10*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: unknown order: %w", err)
	}
	res["order.SEED-ORD-UNK-001"] = unknownOrderID
	payments[4].order = unknownOrderID

	for i, p := range payments {
		ext := fmt.Sprintf("seed-ext-%d", i)
		_, err := tx.Exec(ctx, `
INSERT INTO payment_intents (
  id, order_id, store_id, merchant_id, payment_mode, source, provider, account_scope,
  provider_reference, external_id, amount_idr, currency, fee_snapshot_id,
  status, provider_financial_state, expires_at, buyer_user_id, buyer_email,
  idempotency_key_hash, request_hash, product_snapshot, price_snapshot, version,
  created_at, updated_at
) VALUES (
  $1, $2, $3, $4, 'SANDBOX', 'STOREFRONT', 'XENDIT', 'xendit-primary',
  $5, $6, $7, 'IDR', $8,
  $9, 'NORMAL', $10, $11, 'buyer.a@seed.fersaku.test',
  $12, $13, '{}'::jsonb, '{}'::jsonb, 1,
  $14, $14
)`, p.id, p.order, ID(IDStoreA), ID(IDMerchantA), p.provRef, ext, p.amount,
			ID(IDFeeSnapTx), p.status, p.exp, buyerAID,
			TokenHash("pi-idem-"+p.id), TokenHash("pi-req-"+p.id), now.Add(-34*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: payment %s: %w", p.status, err)
		}
		res["payment."+p.status] = p.id
	}
	return nil
}

func ptrS(s string) *string { return &s }

func seedDelivery(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	// ready / revoked / retry
	grants := []struct {
		id, order, item, status string
		stock                   *string
		revoked                 *time.Time
		failed                  *time.Time
		failReason              string
	}{
		{ID(IDDeliveryReady), ID(IDOrderPaid), ID(IDOrderItemPaid), "ACTIVE", ptrS(ID(IDStockDelivered)), nil, nil, ""},
		{ID(IDDeliveryRevoked), ID(IDOrderPaid), ID(IDOrderItemPaid), "REVOKED", ptrS(ID(IDStockDelivered)), ptr(now.Add(-5 * time.Hour)), nil, ""},
		// Can't have two grants per order_item — unique. Revoked must be different item.
	}
	// Fix: one grant per order_item. Use paid item for ACTIVE ready; create synthetic item for revoked/retry.
	// Simpler: ACTIVE on paid item; for revoked/retry use delivery_attempts states + second grant on pending fails unique item.
	// Insert extra order items for revoked and retry scenarios.
	extraRevokedItem := ID(111)
	extraRetryItem := ID(112)
	for _, it := range []struct {
		id, order string
	}{
		{extraRevokedItem, ID(IDOrderPaid)},
		{extraRetryItem, ID(IDOrderPaid)},
	} {
		_, err := tx.Exec(ctx, `
INSERT INTO order_items (
  id, order_id, store_id, merchant_id, product_id, product_version, product_title, product_type,
  unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr, line_total_idr,
  delivery_kind, created_at
) VALUES (
  $1, $2, $3, $4, $5, '1.0.0', 'Seed Extra Line', 'code',
  0, 1, 0, 0, 0, 'CODE', $6
)`, it.id, it.order, ID(IDStoreA), ID(IDMerchantA), ID(IDProductPublished), now.Add(-29*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: extra item: %w", err)
		}
	}

	type g struct {
		id, item, status string
		stock            *string
		revoked          *time.Time
		failed           *time.Time
		failReason       string
		activated        *time.Time
	}
	act := now.Add(-28 * time.Hour)
	rev := now.Add(-5 * time.Hour)
	fail := now.Add(-6 * time.Hour)
	grants2 := []g{
		{ID(IDDeliveryReady), ID(IDOrderItemPaid), "ACTIVE", ptrS(ID(IDStockDelivered)), nil, nil, "", &act},
		{ID(IDDeliveryRevoked), extraRevokedItem, "REVOKED", nil, &rev, nil, "seed-revoke", &act},
		{ID(IDDeliveryRetry), extraRetryItem, "DELIVERY_FAILED", nil, nil, &fail, "seed-retryable", nil},
	}
	for i, gr := range grants2 {
		_, err := tx.Exec(ctx, `
INSERT INTO delivery_grants (
  id, order_id, order_item_id, store_id, merchant_id, product_id, buyer_user_id, buyer_email,
  delivery_kind, status, stock_item_id, stock_reservation_id, fulfillment_effect_key,
  access_token_hash, access_token_expires_at, max_accesses, access_count,
  recipient_snapshot, product_snapshot, revoked_at, revoke_reason, failed_at, fail_reason,
  activated_at, version, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, 'buyer.a@seed.fersaku.test',
  'CODE', $8, $9, $10, $11,
  $12, $13, 20, 0,
  '{}'::jsonb, '{}'::jsonb, $14, $15, $16, $17,
  $18, 1, $19, $19
)`, gr.id, ID(IDOrderPaid), gr.item, ID(IDStoreA), ID(IDMerchantA), ID(IDProductPublished),
			ID(IDUserBuyerA), gr.status, gr.stock, nil, fmt.Sprintf("seed-effect-%d", i),
			TokenHash(fmt.Sprintf("delivery-access-%d", i)), now.Add(30*24*time.Hour),
			gr.revoked, gr.failReason, gr.failed, gr.failReason, gr.activated, now.Add(-28*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: delivery %s: %w", gr.status, err)
		}
		res["delivery."+gr.status] = gr.id
	}
	_ = grants // silence if unused

	_, err := tx.Exec(ctx, `
INSERT INTO delivery_attempts (
  id, grant_id, order_id, store_id, channel, result, safe_error_code, retry_count,
  actor_kind, reason, created_at
) VALUES
($1, $2, $3, $4, 'EMAIL', 'DELIVERED', NULL, 0, 'SYSTEM', 'seed-ok', $5),
($6, $7, $3, $4, 'RETRY', 'FAILED', 'SEED_RETRY', 2, 'SYSTEM', 'seed-retry', $5)`,
		ID(IDDeliveryAttemptOK), ID(IDDeliveryReady), ID(IDOrderPaid), ID(IDStoreA), now.Add(-27*time.Hour),
		ID(IDDeliveryAttemptFail), ID(IDDeliveryRetry))
	if err != nil {
		return fmt.Errorf("seed: delivery attempts: %w", err)
	}

	_, err = tx.Exec(ctx, `
INSERT INTO invoices (
  id, order_id, store_id, merchant_id, invoice_number, public_code_hash, public_code_hint,
  status, currency, gross_idr, paid_at, current_version, buyer_user_id, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, 'SEED-INV-001', $5, 'SEED****',
  'READY', 'IDR', 50000, $6, 1, $7, $8, $8
)`, ID(IDInvoicePaid), ID(IDOrderPaid), ID(IDStoreA), ID(IDMerchantA),
		TokenHash("invoice-public"), now.Add(-29*time.Hour), ID(IDUserBuyerA), now.Add(-29*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: invoice: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO invoice_versions (
  id, invoice_id, version, renderer_version, snapshot, payload_hash, render_status, created_at
) VALUES (
  $1, $2, 1, 'v1', '{"seed":true}'::jsonb, $3, 'READY', $4
)`, ID(IDInvoiceVersion), ID(IDInvoicePaid), TokenHash("inv-ver"), now.Add(-29*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: invoice version: %w", err)
	}
	res["invoice.SEED-INV-001"] = ID(IDInvoicePaid)
	return nil
}

func seedCoupons(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	type c struct {
		id, code, state string
		maxUses         *int64
		redeemed        int64
		starts, ends    *time.Time
	}
	one := int64(1)
	start := now.Add(-30 * 24 * time.Hour)
	endPast := now.Add(-24 * time.Hour)
	endFuture := now.Add(30 * 24 * time.Hour)
	coupons := []c{
		{ID(IDCouponActive), "SEEDACTIVE", "ACTIVE", nil, 0, &start, &endFuture},
		{ID(IDCouponPaused), "SEEDPAUSED", "PAUSED", nil, 0, &start, &endFuture},
		{ID(IDCouponExpired), "SEEDEXPIRED", "EXPIRED", nil, 0, &start, &endPast},
		{ID(IDCouponLastUse), "SEEDLASTUSE", "ACTIVE", &one, 0, &start, &endFuture},
	}
	for _, cp := range coupons {
		_, err := tx.Exec(ctx, `
INSERT INTO coupons (
  id, store_id, merchant_id, code_display, normalized_code, code_hash,
  discount_kind, discount_value, min_merchandise_idr, max_total_uses, max_per_customer_uses,
  starts_at, ends_at, state, scope, version, policy_version, reserved_count, redeemed_count,
  created_by, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  'PERCENT', 1000, 0, $7, NULL,
  $8, $9, $10, 'ALL_PRODUCTS', 1, 1, 0, $11,
  $12, $13, $13
)`, cp.id, ID(IDStoreA), ID(IDMerchantA), cp.code, cp.code, TokenHash("coupon-"+cp.code),
			cp.maxUses, cp.starts, cp.ends, cp.state, cp.redeemed,
			ID(IDUserSellerOwnerA), now.Add(-20*24*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: coupon %s: %w", cp.code, err)
		}
		res["coupon."+cp.code] = cp.id
	}
	return nil
}

func seedReviews(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	// Need distinct order_items for each review (unique on order_item_id).
	// Create filler orders/items owned by buyer A.
	for i, st := range []struct {
		id, status, label string
		withReply         bool
		withReport        bool
	}{
		{ID(IDReviewPending), "PENDING", "pending", false, false},
		{ID(IDReviewPublished), "PUBLISHED", "published", false, false},
		{ID(IDReviewReplied), "PUBLISHED", "replied", true, false},
		{ID(IDReviewReported), "PUBLISHED", "reported", false, true},
		{ID(IDReviewModerated), "REMOVED", "moderated", false, false},
	} {
		ordID := ID(113 + i)
		itemID := ID(120 + i)
		_, err := tx.Exec(ctx, `
INSERT INTO orders (
  id, order_number, store_id, merchant_id, buyer_user_id, buyer_email, buyer_name,
  payment_status, order_status, source, currency,
  subtotal_idr, discount_idr, tip_idr, fee_idr, gross_idr, merchant_net_idr,
  paid_at, payment_mode, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, 'buyer.a@seed.fersaku.test', 'Buyer A',
  'PAID', 'FULFILLED', 'STOREFRONT', 'IDR',
  50000, 0, 0, 2200, 50000, 47800,
  $6, 'SANDBOX', $6, $6
)`, ordID, fmt.Sprintf("SEED-REV-ORD-%d", i), ID(IDStoreA), ID(IDMerchantA),
			ID(IDUserBuyerA), now.Add(-time.Duration(40+i)*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: review order: %w", err)
		}
		_, err = tx.Exec(ctx, `
INSERT INTO order_items (
  id, order_id, store_id, merchant_id, product_id, product_version, product_title, product_type,
  unit_price_idr, quantity, line_subtotal_idr, discount_allocation_idr, line_total_idr,
  delivery_kind, created_at
) VALUES (
  $1, $2, $3, $4, $5, '1.0.0', 'Seed Published Product', 'code',
  50000, 1, 50000, 0, 50000, 'CODE', $6
)`, itemID, ordID, ID(IDStoreA), ID(IDMerchantA), ID(IDProductPublished), now.Add(-time.Duration(40+i)*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: review item: %w", err)
		}
		_, err = tx.Exec(ctx, `
INSERT INTO product_reviews (
  id, store_id, merchant_id, product_id, order_id, order_item_id, buyer_user_id,
  rating, title, body, status, verified_purchase, content_version, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  5, $8, $9, $10, true, 1, $11, $11
)`, st.id, ID(IDStoreA), ID(IDMerchantA), ID(IDProductPublished), ordID, itemID, ID(IDUserBuyerA),
			"Seed review "+st.status, "Deterministic seed review body", st.status, now.Add(-time.Duration(30+i)*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: review %s: %w", st.status, err)
		}
		res["review."+st.label] = st.id
		if st.withReply {
			_, err = tx.Exec(ctx, `
INSERT INTO product_review_replies (
  id, review_id, store_id, author_user_id, body, content_version, created_at, updated_at
) VALUES ($1, $2, $3, $4, 'Seed seller reply', 1, $5, $5)`,
				ID(IDReviewReply), st.id, ID(IDStoreA), ID(IDUserSellerOwnerA), now.Add(-20*time.Hour))
			if err != nil {
				return fmt.Errorf("seed: review reply: %w", err)
			}
			res["review.reply"] = ID(IDReviewReply)
		}
		if st.withReport {
			_, err = tx.Exec(ctx, `
INSERT INTO product_review_reports (
  id, review_id, reporter_user_id, reason_code, context, status, created_at
) VALUES ($1, $2, $3, 'SPAM', 'seed report', 'OPEN', $4)`,
				ID(IDReviewReport), st.id, ID(IDUserBuyerB), now.Add(-10*time.Hour))
			if err != nil {
				return fmt.Errorf("seed: review report: %w", err)
			}
			res["review.report"] = ID(IDReviewReport)
		}
	}
	return nil
}

func seedFinance(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	_, err := tx.Exec(ctx, `
INSERT INTO bank_accounts (
  id, merchant_id, bank_code, bank_name, account_holder_name,
  account_number_ciphertext, encryption_key_version, account_number_masked, account_number_last4,
  status, is_primary, version, verified_at, created_at, updated_at
) VALUES (
  $1, $2, 'BCA', 'Bank Central Asia', 'Seed Merchant A',
  $3, 'v1', '****1234', '1234',
  'VERIFIED', true, 1, $4, $4, $4
)`, ID(IDBankAccount), ID(IDMerchantA), FakeCiphertext("bank-a"), now.Add(-60*24*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: bank: %w", err)
	}
	res["bank.primary"] = ID(IDBankAccount)

	// Balance available
	_, err = tx.Exec(ctx, `
INSERT INTO merchant_balances (
  merchant_id, payment_mode, available_idr, pending_idr, held_idr,
  lifetime_gross_idr, lifetime_fee_percent_idr, lifetime_fee_fixed_idr, lifetime_net_idr,
  month_gross_idr, month_fee_percent_idr, month_fee_fixed_idr, month_net_idr, month_bucket,
  currency, version, updated_at
) VALUES (
  $1, 'SANDBOX', 500000, 0, 100000,
  1000000, 30000, 7000, 963000,
  200000, 6000, 1400, 192600, '2026-01',
  'IDR', 1, $2
)`, ID(IDMerchantA), now)
	if err != nil {
		return fmt.Errorf("seed: balance: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO merchant_balance_sources (
  merchant_id, payment_mode, source, available_idr, pending_idr, held_idr, lifetime_net_idr, currency, updated_at
) VALUES (
  $1, 'SANDBOX', 'STOREFRONT', 500000, 0, 100000, 963000, 'IDR', $2
)`, ID(IDMerchantA), now)
	if err != nil {
		return fmt.Errorf("seed: balance source: %w", err)
	}
	res["balance.available_idr"] = "500000"
	res["balance.held_idr"] = "100000"

	// Lock scenario
	_, err = tx.Exec(ctx, `
INSERT INTO merchant_withdrawal_locks (merchant_id, locked_until, reason, bank_account_id, created_at, updated_at)
VALUES ($1, $2, 'BANK_CHANGE', $3, $4, $4)
ON CONFLICT (merchant_id) DO UPDATE SET locked_until = EXCLUDED.locked_until, updated_at = EXCLUDED.updated_at`,
		ID(IDMerchantA), now.Add(12*time.Hour), ID(IDBankAccount), now)
	if err != nil {
		return fmt.Errorf("seed: wd lock: %w", err)
	}
	res["withdrawal.lock_until"] = now.Add(12 * time.Hour).Format(time.RFC3339)

	// Quotes: available(active), expired; locked is merchant lock above
	quotes := []struct {
		id, status string
		exp        time.Time
	}{
		{ID(IDWDQuoteAvailable), "ACTIVE", now.Add(5 * time.Minute)},
		{ID(IDWDQuoteExpired), "EXPIRED", now.Add(-1 * time.Hour)},
		{ID(IDWDQuoteLocked), "ACTIVE", now.Add(5 * time.Minute)}, // exists but merchant locked
	}
	for i, q := range quotes {
		_, err = tx.Exec(ctx, `
INSERT INTO withdrawal_quotes (
  id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr, provider_fee_idr, total_fee_idr,
  net_disbursement_idr, currency, policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
  bank_code, bank_name, account_holder_name, account_number_masked,
  status, idempotency_key_hash, request_hash, expires_at, created_at, updated_at
) VALUES (
  $1, $2, $3, 'SANDBOX', 100000, 3000, 2500, 5500,
  94500, 'IDR', 'LAUNCH_FEE_POLICY_V1', $4, $5, 1,
  'BCA', 'Bank Central Asia', 'Seed Merchant A', '****1234',
  $6, $7, $8, $9, $10, $10
)`, q.id, ID(IDMerchantA), ID(IDStoreA), ID(IDFeeSnapWD), ID(IDBankAccount),
			q.status, TokenHash(fmt.Sprintf("wd-quote-idem-%d", i)), TokenHash(fmt.Sprintf("wd-quote-req-%d", i)),
			q.exp, now.Add(-time.Hour))
		if err != nil {
			return fmt.Errorf("seed: quote %s: %w", q.status, err)
		}
		res["withdrawal_quote."+q.status+"."+q.id] = q.id
	}

	// Withdrawals: pending/processing/unknown/completed — each needs own quote (unique quote_id)
	type wd struct {
		id, status, quoteID string
	}
	// Extra quotes for each withdrawal
	extraQuotes := []struct {
		qid, wid, status string
	}{
		{ID(160), ID(IDWDPending), "REQUESTED"},
		{ID(161), ID(IDWDProcessing), "PROCESSING"},
		{ID(162), ID(IDWDUnknown), "UNKNOWN_OUTCOME"},
		{ID(163), ID(IDWDCompleted), "COMPLETED"},
	}
	for i, e := range extraQuotes {
		_, err = tx.Exec(ctx, `
INSERT INTO withdrawal_quotes (
  id, merchant_id, store_id, payment_mode, amount_idr, platform_fee_idr, provider_fee_idr, total_fee_idr,
  net_disbursement_idr, currency, policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
  bank_code, bank_name, account_holder_name, account_number_masked,
  status, idempotency_key_hash, request_hash, expires_at, consumed_withdrawal_id, created_at, updated_at
) VALUES (
  $1, $2, $3, 'SANDBOX', 100000, 3000, 2500, 5500,
  94500, 'IDR', 'LAUNCH_FEE_POLICY_V1', $4, $5, 1,
  'BCA', 'Bank Central Asia', 'Seed Merchant A', '****1234',
  'CONSUMED', $6, $7, $8, $9, $10, $10
)`, e.qid, ID(IDMerchantA), ID(IDStoreA), ID(IDFeeSnapWD), ID(IDBankAccount),
			TokenHash(fmt.Sprintf("wd-q-extra-%d", i)), TokenHash(fmt.Sprintf("wd-q-extra-req-%d", i)),
			now.Add(-30*time.Minute), e.wid, now.Add(-2*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: wd quote extra: %w", err)
		}
		var completed, processing, unknown *time.Time
		switch e.status {
		case "COMPLETED":
			t := now.Add(-1 * time.Hour)
			completed = &t
		case "PROCESSING":
			t := now.Add(-30 * time.Minute)
			processing = &t
		case "UNKNOWN_OUTCOME":
			t := now.Add(-15 * time.Minute)
			unknown = &t
		}
		_, err = tx.Exec(ctx, `
INSERT INTO withdrawals (
  id, merchant_id, store_id, payment_mode, source, quote_id,
  amount_idr, platform_fee_idr, provider_fee_quoted_idr, total_fee_idr, net_disbursement_idr,
  currency, policy_version_id, fee_snapshot_id, bank_account_id, bank_account_version,
  bank_code, bank_name, account_holder_name, account_number_masked,
  status, provider, account_scope, idempotency_key_hash,
  processing_at, completed_at, unknown_outcome_at, created_at, updated_at
) VALUES (
  $1, $2, $3, 'SANDBOX', 'STOREFRONT', $4,
  100000, 3000, 2500, 5500, 94500,
  'IDR', 'LAUNCH_FEE_POLICY_V1', $5, $6, 1,
  'BCA', 'Bank Central Asia', 'Seed Merchant A', '****1234',
  $7, 'xendit', 'xendit-primary', $8,
  $9, $10, $11, $12, $12
)`, e.wid, ID(IDMerchantA), ID(IDStoreA), e.qid, ID(IDFeeSnapWD), ID(IDBankAccount),
			e.status, TokenHash("wd-idem-"+e.wid), processing, completed, unknown, now.Add(-2*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: withdrawal %s: %w", e.status, err)
		}
		res["withdrawal."+e.status] = e.wid
	}
	return nil
}

func seedKYC(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	// Open-case unique: only one open status per merchant. Use merchant A for draft only;
	// merchant B for submitted; empty merchant for others via sequential terminal + open.
	// Strategy:
	// - Merchant A: APPROVED (terminal) + no second open — use A for approved only
	// - Merchant B: SUBMITTED (open)
	// - Empty merchant: DRAFT can't coexist with another open on same merchant
	// Multiple merchants needed for multiple open cases.
	// We have 3 merchants. Terminal cases can share merchant if not open.
	// For needs-info / rejected / draft: put draft on empty, submitted on B, approved+rejected+needs on A as terminal/open carefully.
	// Open statuses: DRAFT, SUBMITTED, IN_REVIEW, VENDOR_CHECK, NEEDS_CLARIFICATION
	// So max 3 open cases. Terminal: APPROVED, REJECTED, EXPIRED can coexist many.
	// Assign:
	// empty merchant: DRAFT
	// merchant B: SUBMITTED
	// merchant A: NEEDS_CLARIFICATION (open) — then cannot also have draft on A
	// approved + rejected as terminal on A after... can't have needs + approved open unique only for open.
	// APPROVED and REJECTED are terminal so both on A OK with one open NEEDS on A? NEEDS is open — only one open on A.
	// A: NEEDS_CLARIFICATION (open) + APPROVED (terminal predecessor) + REJECTED (terminal)
	// Actually predecessor is fine. Multiple terminal OK.

	type kc struct {
		id, mid, status                         string
		submitted, reviewed, approved, rejected *time.Time
		reason                                  string
	}
	sub := now.Add(-48 * time.Hour)
	rev := now.Add(-24 * time.Hour)
	appr := now.Add(-12 * time.Hour)
	rej := now.Add(-36 * time.Hour)
	cases := []kc{
		{ID(IDKYCDraft), ID(IDMerchantEmpty), "DRAFT", nil, nil, nil, nil, ""},
		{ID(IDKYCSubmitted), ID(IDMerchantB), "SUBMITTED", &sub, nil, nil, nil, ""},
		{ID(IDKYCNeedsInfo), ID(IDMerchantA), "NEEDS_CLARIFICATION", &sub, &rev, nil, nil, "seed needs info"},
		{ID(IDKYCApproved), ID(IDMerchantA), "APPROVED", &sub, &rev, &appr, nil, ""},
		{ID(IDKYCRejected), ID(IDMerchantA), "REJECTED", &sub, &rev, nil, &rej, "seed rejected"},
	}
	// Wait: A cannot have both NEEDS_CLARIFICATION and ... only one open. APPROVED/REJECTED terminal OK.
	// NEEDS is open on A — OK alone as open.
	for _, c := range cases {
		_, err := tx.Exec(ctx, `
INSERT INTO kyc_cases (
  id, merchant_id, store_id, capability, status, version,
  legal_name, business_name, registration_number, country_code,
  consent_version, consent_accepted_at, reviewer_user_id, reason, clarification_reason,
  submitted_at, reviewed_at, approved_at, rejected_at, created_at, updated_at
) VALUES (
  $1, $2, $3, 'QRIS_API_LIVE', $4, 1,
  'Seed Legal', 'Seed Business', 'SEED-REG-001', 'ID',
  'v1', $5, $6, $7, $7,
  $8, $9, $10, $11, $12, $12
)`, c.id, c.mid, nil, c.status,
			now.Add(-60*time.Hour), reviewerFor(c.status), c.reason,
			c.submitted, c.reviewed, c.approved, c.rejected, now.Add(-70*time.Hour))
		if err != nil {
			return fmt.Errorf("seed: kyc %s: %w", c.status, err)
		}
		res["kyc."+c.status] = c.id
	}
	return nil
}

func reviewerFor(status string) *string {
	if status == "APPROVED" || status == "REJECTED" || status == "NEEDS_CLARIFICATION" {
		s := ID(IDUserAdminSupport)
		return &s
	}
	return nil
}

func seedCallbacksWebhooks(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	// Rejected callback
	_, err := tx.Exec(ctx, `
INSERT INTO provider_callback_rejections (
  id, provider, account_scope, payment_mode, reason, http_status, content_type,
  body_bytes, body_digest, client_ip, request_id, received_at, created_at
) VALUES (
  $1, 'XENDIT', 'xendit-primary', 'SANDBOX', 'INVALID_SIGNATURE', 401, 'application/json',
  128, $2, '127.0.0.1', 'seed-req-reject', $3, $3
)`, ID(IDCallbackRejected), TokenHash("cb-reject"), now.Add(-8*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: callback reject: %w", err)
	}
	res["callback.rejected"] = ID(IDCallbackRejected)

	// Processed event (duplicate path reference)
	_, err = tx.Exec(ctx, `
INSERT INTO payment_provider_events (
  callback_id, provider, account_scope, payment_mode, provider_event_id, received_at,
  normalized_type, processing_state, payment_intent_id, payload_digest, created_at, updated_at,
  provider_reference, amount_idr, currency, replay_count
) VALUES (
  $1, 'XENDIT', 'xendit-primary', 'SANDBOX', 'seed-evt-paid-001', $2,
  'payment.paid', 'PROCESSED', $3, $4, $2, $2,
  'seed-xendit-paid-001', 50000, 'IDR', 0
)`, ID(IDCallbackEvent), now.Add(-29*time.Hour), ID(IDPaymentPaid), TokenHash("cb-paid"))
	if err != nil {
		return fmt.Errorf("seed: callback event: %w", err)
	}
	res["callback.processed"] = ID(IDCallbackEvent)

	// Replayable: ACCEPTED state with replay_count
	_, err = tx.Exec(ctx, `
INSERT INTO payment_provider_events (
  callback_id, provider, account_scope, payment_mode, provider_event_id, received_at,
  normalized_type, processing_state, payment_intent_id, payload_digest, created_at, updated_at,
  provider_reference, amount_idr, currency, replay_count, last_replay_at, last_replay_reason
) VALUES (
  $1, 'XENDIT', 'xendit-primary', 'SANDBOX', 'seed-evt-replay-001', $2,
  'payment.paid', 'ACCEPTED', $3, $4, $2, $2,
  'seed-xendit-paid-001', 50000, 'IDR', 1, $5, 'seed-admin-replay'
)`, ID(IDCallbackReplayable), now.Add(-1*time.Hour), ID(IDPaymentPaid), TokenHash("cb-replay"),
		now.Add(-30*time.Minute))
	if err != nil {
		return fmt.Errorf("seed: callback replayable: %w", err)
	}
	res["callback.replayable"] = ID(IDCallbackReplayable)

	// Settlement for paid
	_, err = tx.Exec(ctx, `
INSERT INTO payment_settlements (
  id, payment_intent_id, order_id, merchant_id, store_id, payment_mode, source,
  provider, account_scope, provider_reference, provider_event_id, journal_reference,
  gross_idr, fee_idr, merchant_net_idr, currency, status, posted_at, created_at
) VALUES (
  $1, $2, $3, $4, $5, 'SANDBOX', 'STOREFRONT',
  'XENDIT', 'xendit-primary', 'seed-xendit-paid-001', 'seed-evt-paid-001', $6,
  50000, 2200, 47800, 'IDR', 'POSTED', $7, $7
)`, ID(IDSettlement), ID(IDPaymentPaid), ID(IDOrderPaid), ID(IDMerchantA), ID(IDStoreA),
		"PAYMENT_CAPTURE:"+ID(IDPaymentPaid), now.Add(-29*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: settlement: %w", err)
	}
	res["settlement.paid"] = ID(IDSettlement)

	// Webhook endpoint + delivery retry/DLQ
	_, err = tx.Exec(ctx, `
INSERT INTO seller_webhook_endpoints (
  id, merchant_id, payment_mode, url, status, config_version, event_allowlist,
  secret_ciphertext, secret_key_version, store_id, url_host, created_at, updated_at
) VALUES (
  $1, $2, 'SANDBOX', 'https://hooks.seed.fersaku.test/webhook', 'ACTIVE', 1, '["payment.paid"]'::jsonb,
  $3, 'v1', $4, 'hooks.seed.fersaku.test', $5, $5
)`, ID(IDWebhookEndpoint), ID(IDMerchantA), FakeCiphertext("wh-secret"), ID(IDStoreA), now.Add(-40*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: webhook endpoint: %w", err)
	}
	res["webhook.endpoint"] = ID(IDWebhookEndpoint)

	_, err = tx.Exec(ctx, `
INSERT INTO webhook_deliveries (
  id, endpoint_id, merchant_id, store_id, payment_mode, event_id, event_type, payload_version,
  payload_body, payload_hash, source_kind, payment_intent_id, order_id, is_test,
  status, attempt_count, max_attempts, next_retry_at, last_http_status, last_error_class,
  dead_letter_reason, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, 'SANDBOX', 'seed-wh-evt-1', 'payment.paid', 'fersaku.webhook.v1',
  $5, $6, 'PAYMENT', $7, $8, true,
  'DEAD_LETTER', 8, 8, NULL, 500, 'HTTP_5XX',
  'seed max attempts', $9, $9
)`, ID(IDWebhookDelivery), ID(IDWebhookEndpoint), ID(IDMerchantA), ID(IDStoreA),
		[]byte(`{"seed":true}`), TokenHash("wh-payload"), ID(IDPaymentPaid), ID(IDOrderPaid),
		now.Add(-6*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: webhook delivery: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO webhook_delivery_attempts (
  id, delivery_id, attempt_no, signed_timestamp, signature_header, request_url,
  http_status, latency_ms, error_class, started_at, finished_at
) VALUES (
  $1, $2, 8, $3, 'seed-sig-meta', 'https://hooks.seed.fersaku.test/webhook',
  500, 120, 'HTTP_5XX', $4, $4
)`, ID(IDWebhookAttempt), ID(IDWebhookDelivery), now.Add(-6*time.Hour).Format(time.RFC3339),
		now.Add(-6*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: webhook attempt: %w", err)
	}
	_, err = tx.Exec(ctx, `
INSERT INTO webhook_dead_letters (
  id, delivery_id, endpoint_id, merchant_id, event_id, event_type, reason,
  last_http_status, attempt_count, created_at
) VALUES (
  $1, $2, $3, $4, 'seed-wh-evt-1', 'payment.paid', 'seed max attempts',
  500, 8, $5
)`, ID(IDWebhookDLQ), ID(IDWebhookDelivery), ID(IDWebhookEndpoint), ID(IDMerchantA), now.Add(-6*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: webhook dlq: %w", err)
	}
	res["webhook.dlq"] = ID(IDWebhookDLQ)
	res["webhook.delivery_retry_dlq"] = ID(IDWebhookDelivery)
	return nil
}

func seedNotificationsAudit(ctx context.Context, tx pgx.Tx, now time.Time, res map[string]string) error {
	_, err := tx.Exec(ctx, `
INSERT INTO notifications (
  id, recipient_user_id, tenant_type, tenant_id, surface, event_code, title, body,
  cta_path, content_version, priority, retention_class, read_at, created_at
) VALUES (
  $1, $2, 'MERCHANT', $3, 'BUYER', 'PAYMENT_RECEIPT', 'Seed payment receipt', 'Your seed order is paid',
  '/buyer/purchases', 'seed-v1', 'INFO', 'STANDARD', NULL, $4
)`, ID(IDNotifBuyerA), ID(IDUserBuyerA), ID(IDMerchantA), now.Add(-28*time.Hour))
	if err != nil {
		return fmt.Errorf("seed: notification: %w", err)
	}
	res["notification.buyer_a"] = ID(IDNotifBuyerA)

	// Audit chain via SECURITY DEFINER function when available
	var exists bool
	err = tx.QueryRow(ctx, `
SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'append_audit_event' AND n.nspname = 'public'
)`).Scan(&exists)
	if err != nil {
		return fmt.Errorf("seed: audit probe: %w", err)
	}
	if exists {
		payload := []byte(`{"task":"QLT-110","event":"deterministic_seed"}`)
		_, err = tx.Exec(ctx, `
SELECT out_id FROM append_audit_event(
  $1, 'default', 'JCS-1', $2,
  $3, 'SEED_QLT110', 'seed', $1,
  'qlt110 deterministic seed', NULL, NULL,
  $4::jsonb, $5
)`, ID(IDAuditSeedNote), payload, ID(IDUserAdminSuper),
			`{"task":"QLT-110","seed":true}`, now)
		if err != nil {
			res["audit.append_error"] = err.Error()
		} else {
			res["audit.seed_event"] = ID(IDAuditSeedNote)
		}
	}
	return nil
}
