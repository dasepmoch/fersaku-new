package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/ledger"
)

type ledgerTxKey struct{}

// LedgerRepo implements application.LedgerStore.
type LedgerRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

// NewLedgerRepo constructs a ledger repository.
func NewLedgerRepo(pool *pgxpool.Pool) *LedgerRepo {
	return &LedgerRepo{pool: pool, q: gen.New(pool)}
}

func (r *LedgerRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(ledgerTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *LedgerRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(ledgerTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("ledger: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, ledgerTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("ledger: commit: %w", err)
	}
	return nil
}

func (r *LedgerRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *LedgerRepo) PostJournal(ctx context.Context, p application.PostJournalParams) (string, error) {
	entries := make([]map[string]any, 0, len(p.Legs))
	for _, leg := range p.Legs {
		m := map[string]any{
			"account_code": leg.AccountCode,
			"side":         leg.Side,
			"amount_idr":   leg.AmountIDR,
		}
		if leg.FeeComponent != "" {
			m["fee_component"] = leg.FeeComponent
		}
		if leg.SettlementLotID != "" {
			m["settlement_lot_id"] = leg.SettlementLotID
		}
		if leg.AvailableAt != nil {
			m["available_at"] = leg.AvailableAt.UTC().Format(time.RFC3339Nano)
		}
		entries = append(entries, m)
	}
	raw, err := json.Marshal(entries)
	if err != nil {
		return "", err
	}

	var gross, feeP, feeF, net any
	if p.GrossIDR != nil {
		gross = *p.GrossIDR
	}
	if p.FeePercentIDR != nil {
		feeP = *p.FeePercentIDR
	}
	if p.FeeFixedIDR != nil {
		feeF = *p.FeeFixedIDR
	}
	if p.MerchantNetIDR != nil {
		net = *p.MerchantNetIDR
	}

	sql := `
SELECT post_ledger_transaction(
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
    $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::jsonb
)`
	args := []any{
		p.JournalID,
		p.MerchantID,
		p.StoreID,
		p.PaymentMode,
		p.Source,
		p.TemplateCode,
		p.ReferenceType,
		p.ReferenceID,
		p.JournalReference,
		p.IdempotencyKey,
		p.Description,
		p.PaymentIntentID,
		p.OrderID,
		p.SettlementLotID,
		p.FeeSnapshotID,
		gross,
		feeP,
		feeF,
		net,
		p.PostedAt.UTC(),
		string(raw),
	}

	var journalID string
	if tx, ok := ctx.Value(ledgerTxKey{}).(pgx.Tx); ok && tx != nil {
		err = tx.QueryRow(ctx, sql, args...).Scan(&journalID)
	} else {
		err = r.pool.QueryRow(ctx, sql, args...).Scan(&journalID)
	}
	if err != nil {
		return "", fmt.Errorf("post_ledger_transaction: %w", err)
	}
	return journalID, nil
}

func (r *LedgerRepo) GetJournalByReference(ctx context.Context, ref string) (ledger.Journal, error) {
	row, err := r.queries(ctx).LedgerGetJournalByReference(ctx, ref)
	if err != nil {
		return ledger.Journal{}, err
	}
	return mapJournal(row), nil
}

func (r *LedgerRepo) GetJournalByID(ctx context.Context, id string) (ledger.Journal, error) {
	row, err := r.queries(ctx).LedgerGetJournalByID(ctx, id)
	if err != nil {
		return ledger.Journal{}, err
	}
	return mapJournal(row), nil
}

func (r *LedgerRepo) ListJournals(ctx context.Context, f application.LedgerListFilter) ([]ledger.Journal, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.queries(ctx).LedgerListJournals(ctx, gen.LedgerListJournalsParams{
		MerchantID:     f.MerchantID,
		PaymentMode:    f.PaymentMode,
		Source:         f.Source,
		TemplateCode:   f.Template,
		CursorPostedAt: timeToPgTimestamptz(f.CursorAt),
		CursorID:       f.CursorID,
		Limit:          limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ledger.Journal, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapJournal(row))
	}
	return out, nil
}

func (r *LedgerRepo) ListEntriesByJournal(ctx context.Context, journalID string) ([]ledger.Entry, error) {
	rows, err := r.queries(ctx).LedgerListEntriesByJournal(ctx, journalID)
	if err != nil {
		return nil, err
	}
	out := make([]ledger.Entry, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapEntry(row))
	}
	return out, nil
}

func (r *LedgerRepo) GetBalance(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, error) {
	row, err := r.queries(ctx).LedgerGetBalance(ctx, gen.LedgerGetBalanceParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ledger.Balance{
				MerchantID:  merchantID,
				PaymentMode: paymentMode,
				Currency:    ledger.CurrencyIDR,
			}, nil
		}
		return ledger.Balance{}, err
	}
	return mapBalance(row), nil
}

func (r *LedgerRepo) ListSourceBalances(ctx context.Context, merchantID, paymentMode string) ([]ledger.SourceBalance, error) {
	rows, err := r.queries(ctx).LedgerListSourceBalances(ctx, gen.LedgerListSourceBalancesParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ledger.SourceBalance, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapSourceBalance(row))
	}
	return out, nil
}

func (r *LedgerRepo) RebuildBalances(ctx context.Context, merchantID, paymentMode string) error {
	sql := `SELECT rebuild_merchant_balances($1, $2)`
	var err error
	if tx, ok := ctx.Value(ledgerTxKey{}).(pgx.Tx); ok && tx != nil {
		_, err = tx.Exec(ctx, sql, merchantID, paymentMode)
	} else {
		_, err = r.pool.Exec(ctx, sql, merchantID, paymentMode)
	}
	return err
}

func (r *LedgerRepo) InsertSettlementLot(ctx context.Context, lot ledger.SettlementLot) (ledger.SettlementLot, error) {
	row, err := r.queries(ctx).LedgerInsertSettlementLot(ctx, gen.LedgerInsertSettlementLotParams{
		ID:                 lot.ID,
		MerchantID:         lot.MerchantID,
		StoreID:            lot.StoreID,
		PaymentMode:        lot.PaymentMode,
		Source:             lot.Source,
		PaymentIntentID:    lot.PaymentIntentID,
		OrderID:            lot.OrderID,
		CaptureJournalID:   lot.CaptureJournalID,
		ReleaseJournalID:   lot.ReleaseJournalID,
		OriginalAmountIdr:  lot.OriginalAmountIDR,
		RemainingAmountIdr: lot.RemainingAmountIDR,
		Currency:           lot.Currency,
		Status:             lot.Status,
		AvailableAt:        lot.AvailableAt,
		ReleasedAt:         timeToPgTimestamptz(lot.ReleasedAt),
		CreatedAt:          lot.CreatedAt,
		UpdatedAt:          lot.UpdatedAt,
	})
	if err != nil {
		return ledger.SettlementLot{}, err
	}
	return mapLot(row), nil
}

func (r *LedgerRepo) GetLotByIntent(ctx context.Context, paymentIntentID string) (ledger.SettlementLot, error) {
	row, err := r.queries(ctx).LedgerGetLotByIntent(ctx, &paymentIntentID)
	if err != nil {
		return ledger.SettlementLot{}, err
	}
	return mapLot(row), nil
}

func (r *LedgerRepo) GetLotByID(ctx context.Context, id string) (ledger.SettlementLot, error) {
	row, err := r.queries(ctx).LedgerGetLotByID(ctx, id)
	if err != nil {
		return ledger.SettlementLot{}, err
	}
	return mapLot(row), nil
}

func (r *LedgerRepo) UpdateLotAfterCapture(ctx context.Context, lotID, captureJournalID, status string, remaining int64, at time.Time) error {
	return r.queries(ctx).LedgerUpdateLotAfterCapture(ctx, gen.LedgerUpdateLotAfterCaptureParams{
		ID:                 lotID,
		CaptureJournalID:   &captureJournalID,
		Status:             status,
		RemainingAmountIdr: remaining,
		UpdatedAt:          at,
	})
}

func (r *LedgerRepo) UpdateLotAfterRelease(ctx context.Context, lotID, releaseJournalID, status string, remaining int64, at time.Time) error {
	return r.queries(ctx).LedgerUpdateLotAfterRelease(ctx, gen.LedgerUpdateLotAfterReleaseParams{
		ID:                 lotID,
		ReleaseJournalID:   &releaseJournalID,
		Status:             status,
		RemainingAmountIdr: remaining,
		ReleasedAt:         timeToPgTimestamptz(&at),
	})
}

func (r *LedgerRepo) ListAvailableLots(ctx context.Context, merchantID, paymentMode string) ([]ledger.SettlementLot, error) {
	rows, err := r.queries(ctx).LedgerListAvailableLots(ctx, gen.LedgerListAvailableLotsParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ledger.SettlementLot, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapLot(row))
	}
	return out, nil
}

func (r *LedgerRepo) ListDuePendingLots(ctx context.Context, asOf time.Time, limit int32) ([]ledger.SettlementLot, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.queries(ctx).LedgerListDuePendingLots(ctx, gen.LedgerListDuePendingLotsParams{
		AvailableAt: asOf,
		Limit:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ledger.SettlementLot, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapLot(row))
	}
	return out, nil
}

func (r *LedgerRepo) ConsumeLotRemaining(ctx context.Context, lotID string, amountIDR int64, at time.Time) error {
	return r.queries(ctx).LedgerConsumeLotRemaining(ctx, gen.LedgerConsumeLotRemainingParams{
		ID:                 lotID,
		RemainingAmountIdr: amountIDR,
		UpdatedAt:          at,
	})
}

func (r *LedgerRepo) RestoreLotRemaining(ctx context.Context, lotID string, amountIDR int64, at time.Time) error {
	return r.queries(ctx).LedgerRestoreLotRemaining(ctx, gen.LedgerRestoreLotRemainingParams{
		ID:                 lotID,
		RemainingAmountIdr: amountIDR,
		UpdatedAt:          at,
	})
}

func (r *LedgerRepo) LockBalance(ctx context.Context, merchantID, paymentMode string) (ledger.Balance, error) {
	row, err := r.queries(ctx).LedgerLockBalance(ctx, gen.LedgerLockBalanceParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
	})
	if err != nil {
		return ledger.Balance{}, err
	}
	return mapBalance(row), nil
}

func (r *LedgerRepo) EnsureBalance(ctx context.Context, merchantID, paymentMode string, at time.Time) error {
	return r.queries(ctx).LedgerEnsureBalance(ctx, gen.LedgerEnsureBalanceParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
		UpdatedAt:   at,
	})
}

func (r *LedgerRepo) SettlementDelaySeconds(ctx context.Context) (int64, error) {
	val, err := r.queries(ctx).LedgerGetSettlementDelaySeconds(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ledger.DefaultSettlementDelaySeconds, nil
		}
		return 0, err
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return ledger.DefaultSettlementDelaySeconds, nil
	}
	return n, nil
}

func (r *LedgerRepo) LinkPaymentSettlement(ctx context.Context, settlementID, journalID string, feePercent, feeFixed int64, lotID string, availableAt time.Time) error {
	return r.queries(ctx).LedgerLinkPaymentSettlement(ctx, gen.LedgerLinkPaymentSettlementParams{
		ID:              settlementID,
		LedgerJournalID: &journalID,
		FeePercentIdr:   &feePercent,
		FeeFixedIdr:     &feeFixed,
		SettlementLotID: &lotID,
		AvailableAt:     timeToPgTimestamptz(&availableAt),
	})
}

func (r *LedgerRepo) GetStoreMerchant(ctx context.Context, storeID string) (string, string, error) {
	row, err := r.queries(ctx).LedgerGetStoreMerchant(ctx, storeID)
	if err != nil {
		return "", "", err
	}
	return row.ID, row.MerchantID, nil
}

func (r *LedgerRepo) RevenueByDay(ctx context.Context, merchantID, paymentMode string, from, to time.Time) ([]ledger.RevenuePoint, error) {
	rows, err := r.queries(ctx).LedgerRevenueByDay(ctx, gen.LedgerRevenueByDayParams{
		MerchantID:  merchantID,
		PaymentMode: paymentMode,
		PostedAt:    from,
		PostedAt_2:  to,
	})
	if err != nil {
		return nil, err
	}
	out := make([]ledger.RevenuePoint, 0, len(rows))
	for _, row := range rows {
		out = append(out, ledger.RevenuePoint{
			Day:     row.Day,
			Revenue: row.Revenue,
			Orders:  row.Orders,
		})
	}
	return out, nil
}

func mapJournal(row gen.LedgerJournal) ledger.Journal {
	return ledger.Journal{
		ID:               row.ID,
		MerchantID:       row.MerchantID,
		StoreID:          row.StoreID,
		PaymentMode:      row.PaymentMode,
		Source:           row.Source,
		TemplateCode:     row.TemplateCode,
		ReferenceType:    row.ReferenceType,
		ReferenceID:      row.ReferenceID,
		JournalReference: row.JournalReference,
		IdempotencyKey:   row.IdempotencyKey,
		Status:           row.Status,
		Currency:         row.Currency,
		Description:      row.Description,
		PaymentIntentID:  row.PaymentIntentID,
		OrderID:          row.OrderID,
		SettlementLotID:  row.SettlementLotID,
		FeeSnapshotID:    row.FeeSnapshotID,
		GrossIDR:         row.GrossIdr,
		FeePercentIDR:    row.FeePercentIdr,
		FeeFixedIDR:      row.FeeFixedIdr,
		MerchantNetIDR:   row.MerchantNetIdr,
		PostedAt:         row.PostedAt,
		CreatedAt:        row.CreatedAt,
	}
}

func mapEntry(row gen.LedgerEntry) ledger.Entry {
	return ledger.Entry{
		ID:              row.ID,
		JournalID:       row.JournalID,
		AccountCode:     row.AccountCode,
		Side:            row.Side,
		AmountIDR:       row.AmountIdr,
		Currency:        row.Currency,
		FeeComponent:    row.FeeComponent,
		Source:          row.Source,
		PaymentMode:     row.PaymentMode,
		MerchantID:      row.MerchantID,
		SettlementLotID: row.SettlementLotID,
		AvailableAt:     pgTimestamptzToTimePtr(row.AvailableAt),
		LineNo:          row.LineNo,
		CreatedAt:       row.CreatedAt,
	}
}

func mapBalance(row gen.MerchantBalance) ledger.Balance {
	return ledger.Balance{
		MerchantID:            row.MerchantID,
		PaymentMode:           row.PaymentMode,
		AvailableIDR:          row.AvailableIdr,
		PendingIDR:            row.PendingIdr,
		HeldIDR:               row.HeldIdr,
		LifetimeGrossIDR:      row.LifetimeGrossIdr,
		LifetimeFeePercentIDR: row.LifetimeFeePercentIdr,
		LifetimeFeeFixedIDR:   row.LifetimeFeeFixedIdr,
		LifetimeNetIDR:        row.LifetimeNetIdr,
		MonthGrossIDR:         row.MonthGrossIdr,
		MonthFeePercentIDR:    row.MonthFeePercentIdr,
		MonthFeeFixedIDR:      row.MonthFeeFixedIdr,
		MonthNetIDR:           row.MonthNetIdr,
		MonthBucket:           row.MonthBucket,
		Currency:              row.Currency,
		Version:               row.Version,
		UpdatedAt:             row.UpdatedAt,
	}
}

func mapSourceBalance(row gen.MerchantBalanceSource) ledger.SourceBalance {
	return ledger.SourceBalance{
		MerchantID:     row.MerchantID,
		PaymentMode:    row.PaymentMode,
		Source:         row.Source,
		AvailableIDR:   row.AvailableIdr,
		PendingIDR:     row.PendingIdr,
		HeldIDR:        row.HeldIdr,
		LifetimeNetIDR: row.LifetimeNetIdr,
		Currency:       row.Currency,
		UpdatedAt:      row.UpdatedAt,
	}
}

func mapLot(row gen.SettlementLot) ledger.SettlementLot {
	return ledger.SettlementLot{
		ID:                 row.ID,
		MerchantID:         row.MerchantID,
		StoreID:            row.StoreID,
		PaymentMode:        row.PaymentMode,
		Source:             row.Source,
		PaymentIntentID:    row.PaymentIntentID,
		OrderID:            row.OrderID,
		CaptureJournalID:   row.CaptureJournalID,
		ReleaseJournalID:   row.ReleaseJournalID,
		OriginalAmountIDR:  row.OriginalAmountIdr,
		RemainingAmountIDR: row.RemainingAmountIdr,
		Currency:           row.Currency,
		Status:             row.Status,
		AvailableAt:        row.AvailableAt,
		ReleasedAt:         pgTimestamptzToTimePtr(row.ReleasedAt),
		CreatedAt:          row.CreatedAt,
		UpdatedAt:          row.UpdatedAt,
	}
}

func timeToPgTimestamptz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{Valid: false}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func pgTimestamptzToTimePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	tt := t.Time.UTC()
	return &tt
}
