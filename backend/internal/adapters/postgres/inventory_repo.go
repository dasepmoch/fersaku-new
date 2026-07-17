package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/postgres/gen"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/inventory"
)

type inventoryTxKey struct{}

// InventoryRepo is the Postgres adapter for BE-230 inventory.
// Transactions are stored on context so concurrent reserves use SKIP LOCKED safely.
type InventoryRepo struct {
	pool *pgxpool.Pool
	q    *gen.Queries
}

func NewInventoryRepo(pool *pgxpool.Pool) *InventoryRepo {
	return &InventoryRepo{pool: pool, q: gen.New(pool)}
}

func (r *InventoryRepo) queries(ctx context.Context) *gen.Queries {
	if tx, ok := ctx.Value(inventoryTxKey{}).(pgx.Tx); ok && tx != nil {
		return r.q.WithTx(tx)
	}
	return r.q
}

func (r *InventoryRepo) WithTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(inventoryTxKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("inventory: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txCtx := context.WithValue(ctx, inventoryTxKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("inventory: commit: %w", err)
	}
	return nil
}

func (r *InventoryRepo) IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (r *InventoryRepo) IsUniqueViolation(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == "23505"
}

func (r *InventoryRepo) GetStoreByID(ctx context.Context, storeID string) (application.CatalogStoreRow, error) {
	row, err := r.queries(ctx).InventoryGetStoreByID(ctx, storeID)
	if err != nil {
		return application.CatalogStoreRow{}, err
	}
	return mapCatalogStore(row.ID, row.MerchantID, row.Slug, row.Name, row.Bio, row.Address, row.AccentColor,
		row.Status, row.IsCanonical, row.StorefrontRevision, row.PublishedRevision, row.PublishedRevisionID,
		row.CreatedAt, row.UpdatedAt), nil
}

func (r *InventoryRepo) UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error) {
	return r.queries(ctx).InventoryUserCanAccessStore(ctx, gen.InventoryUserCanAccessStoreParams{
		ID:     storeID,
		UserID: userID,
	})
}

func (r *InventoryRepo) UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error) {
	return r.queries(ctx).InventoryUserIsPlatformAdmin(ctx, userID)
}

func (r *InventoryRepo) GetProduct(ctx context.Context, storeID, productID string) (application.InventoryProductRow, error) {
	row, err := r.queries(ctx).InventoryGetProduct(ctx, gen.InventoryGetProductParams{
		ID:      productID,
		StoreID: storeID,
	})
	if err != nil {
		return application.InventoryProductRow{}, err
	}
	return application.InventoryProductRow{
		ID:                  row.ID,
		StoreID:             row.StoreID,
		MerchantID:          row.MerchantID,
		Slug:                row.Slug,
		Title:               row.Title,
		Type:                row.Type,
		Status:              row.Status,
		ActiveSchemaVersion: row.ActiveSchemaVersion,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}, nil
}

func (r *InventoryRepo) SetProductActiveSchema(ctx context.Context, storeID, productID string, version int32, now time.Time) error {
	return r.queries(ctx).InventorySetProductActiveSchema(ctx, gen.InventorySetProductActiveSchemaParams{
		ID:                  productID,
		ActiveSchemaVersion: &version,
		UpdatedAt:           now,
		StoreID:             storeID,
	})
}

func (r *InventoryRepo) InsertSchema(ctx context.Context, s inventory.Schema) error {
	fields, err := inventory.FieldsJSON(s.Fields)
	if err != nil {
		return err
	}
	return r.queries(ctx).InsertInventorySchema(ctx, gen.InsertInventorySchemaParams{
		ID:         s.ID,
		ProductID:  s.ProductID,
		StoreID:    s.StoreID,
		MerchantID: s.MerchantID,
		Version:    s.Version,
		Fields:     fields,
		Delimiter:  s.Delimiter,
		Checksum:   s.Checksum,
		CreatedBy:  s.CreatedBy,
		CreatedAt:  s.CreatedAt,
	})
}

func mapSchema(id, productID, storeID, merchantID string, version int32, fields []byte, delimiter, checksum string, createdBy *string, createdAt time.Time) (inventory.Schema, error) {
	f, err := inventory.ParseFields(fields)
	if err != nil {
		return inventory.Schema{}, err
	}
	return inventory.Schema{
		ID:         id,
		ProductID:  productID,
		StoreID:    storeID,
		MerchantID: merchantID,
		Version:    version,
		Fields:     f,
		Delimiter:  delimiter,
		Checksum:   checksum,
		CreatedBy:  createdBy,
		CreatedAt:  createdAt,
	}, nil
}

func (r *InventoryRepo) GetSchemaByVersion(ctx context.Context, productID string, version int32) (inventory.Schema, error) {
	row, err := r.queries(ctx).GetInventorySchemaByVersion(ctx, gen.GetInventorySchemaByVersionParams{
		ProductID: productID,
		Version:   version,
	})
	if err != nil {
		return inventory.Schema{}, err
	}
	return mapSchema(row.ID, row.ProductID, row.StoreID, row.MerchantID, row.Version, row.Fields, row.Delimiter, row.Checksum, row.CreatedBy, row.CreatedAt)
}

func (r *InventoryRepo) GetActiveSchema(ctx context.Context, storeID, productID string) (inventory.Schema, error) {
	row, err := r.queries(ctx).GetInventorySchemaActive(ctx, gen.GetInventorySchemaActiveParams{
		ID:      productID,
		StoreID: storeID,
	})
	if err != nil {
		return inventory.Schema{}, err
	}
	return mapSchema(row.ID, row.ProductID, row.StoreID, row.MerchantID, row.Version, row.Fields, row.Delimiter, row.Checksum, row.CreatedBy, row.CreatedAt)
}

func (r *InventoryRepo) MaxSchemaVersion(ctx context.Context, productID string) (int32, error) {
	return r.queries(ctx).MaxInventorySchemaVersion(ctx, productID)
}

func maskPreviewJSON(m map[string]string) []byte {
	if m == nil {
		m = map[string]string{}
	}
	b, _ := json.Marshal(m)
	return b
}

func parseMaskPreview(raw []byte) map[string]string {
	out := map[string]string{}
	if len(raw) == 0 {
		return out
	}
	_ = json.Unmarshal(raw, &out)
	return out
}

func mapStockItem(
	id, productID, storeID, merchantID string,
	schemaVersion int32, status string,
	enc []byte, keyVersion string, masked []byte, uniqueHash *string,
	createdBy *string, createdAt, updatedAt time.Time,
	reservedAt, deliveredAt, revokedAt pgtype.Timestamptz,
) inventory.StockItem {
	item := inventory.StockItem{
		ID:               id,
		ProductID:        productID,
		StoreID:          storeID,
		MerchantID:       merchantID,
		SchemaVersion:    schemaVersion,
		Status:           status,
		EncryptedPayload: enc,
		KeyVersion:       keyVersion,
		MaskedPreview:    parseMaskPreview(masked),
		UniqueKeyHash:    uniqueHash,
		CreatedBy:        createdBy,
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
	}
	if reservedAt.Valid {
		t := reservedAt.Time
		item.ReservedAt = &t
	}
	if deliveredAt.Valid {
		t := deliveredAt.Time
		item.DeliveredAt = &t
	}
	if revokedAt.Valid {
		t := revokedAt.Time
		item.RevokedAt = &t
	}
	return item
}

func (r *InventoryRepo) InsertStockItem(ctx context.Context, item inventory.StockItem) error {
	return r.queries(ctx).InsertStockItem(ctx, gen.InsertStockItemParams{
		ID:               item.ID,
		ProductID:        item.ProductID,
		StoreID:          item.StoreID,
		MerchantID:       item.MerchantID,
		SchemaVersion:    item.SchemaVersion,
		Status:           item.Status,
		EncryptedPayload: item.EncryptedPayload,
		KeyVersion:       item.KeyVersion,
		MaskedPreview:    maskPreviewJSON(item.MaskedPreview),
		UniqueKeyHash:    item.UniqueKeyHash,
		CreatedBy:        item.CreatedBy,
		CreatedAt:        item.CreatedAt,
		UpdatedAt:        item.UpdatedAt,
	})
}

func (r *InventoryRepo) GetStockItemByID(ctx context.Context, storeID, itemID string) (inventory.StockItem, error) {
	row, err := r.queries(ctx).GetStockItemByID(ctx, gen.GetStockItemByIDParams{
		ID:      itemID,
		StoreID: storeID,
	})
	if err != nil {
		return inventory.StockItem{}, err
	}
	return mapStockItem(row.ID, row.ProductID, row.StoreID, row.MerchantID, row.SchemaVersion, row.Status,
		row.EncryptedPayload, row.KeyVersion, row.MaskedPreview, row.UniqueKeyHash, row.CreatedBy,
		row.CreatedAt, row.UpdatedAt, row.ReservedAt, row.DeliveredAt, row.RevokedAt), nil
}

func (r *InventoryRepo) ListStockItemsByProduct(ctx context.Context, storeID, productID string, limit int32) ([]inventory.StockItem, error) {
	rows, err := r.queries(ctx).ListStockItemsByProduct(ctx, gen.ListStockItemsByProductParams{
		ProductID: productID,
		StoreID:   storeID,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]inventory.StockItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapStockItem(row.ID, row.ProductID, row.StoreID, row.MerchantID, row.SchemaVersion, row.Status,
			row.EncryptedPayload, row.KeyVersion, row.MaskedPreview, row.UniqueKeyHash, row.CreatedBy,
			row.CreatedAt, row.UpdatedAt, row.ReservedAt, row.DeliveredAt, row.RevokedAt))
	}
	return out, nil
}

func (r *InventoryRepo) CountStockByStatus(ctx context.Context, storeID, productID string) (map[string]int64, error) {
	rows, err := r.queries(ctx).CountStockByStatus(ctx, gen.CountStockByStatusParams{
		ProductID: productID,
		StoreID:   storeID,
	})
	if err != nil {
		return nil, err
	}
	out := make(map[string]int64, len(rows))
	for _, row := range rows {
		out[row.Status] = row.Cnt
	}
	return out, nil
}

func (r *InventoryRepo) ListProductSummaries(ctx context.Context, storeID string) ([]inventory.ProductSummary, error) {
	rows, err := r.queries(ctx).ListInventoryProductSummaries(ctx, storeID)
	if err != nil {
		return nil, err
	}
	out := make([]inventory.ProductSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, inventory.ProductSummary{
			ProductID:           row.ProductID,
			StoreID:             row.StoreID,
			ActiveSchemaVersion: row.ActiveSchemaVersion,
			Available:           row.Available,
			Reserved:            row.Reserved,
			Delivered:           row.Delivered,
			Revoked:             row.Revoked,
			Total:               row.Total,
		})
	}
	return out, nil
}

func (r *InventoryRepo) ClaimAvailableStockItem(ctx context.Context, storeID, productID string) (inventory.StockItem, error) {
	row, err := r.queries(ctx).ClaimAvailableStockItem(ctx, gen.ClaimAvailableStockItemParams{
		ProductID: productID,
		StoreID:   storeID,
	})
	if err != nil {
		return inventory.StockItem{}, err
	}
	return mapStockItem(row.ID, row.ProductID, row.StoreID, row.MerchantID, row.SchemaVersion, row.Status,
		row.EncryptedPayload, row.KeyVersion, row.MaskedPreview, row.UniqueKeyHash, row.CreatedBy,
		row.CreatedAt, row.UpdatedAt, row.ReservedAt, row.DeliveredAt, row.RevokedAt), nil
}

func (r *InventoryRepo) UpdateStockItemStatus(ctx context.Context, id, from, to string, now time.Time) (bool, error) {
	n, err := r.queries(ctx).UpdateStockItemStatus(ctx, gen.UpdateStockItemStatusParams{
		ID:        id,
		Status:    to,
		UpdatedAt: now,
		Status_2:  from,
	})
	return n > 0, err
}

func mapReservation(
	id, stockItemID, productID, storeID, merchantID string,
	orderID, checkoutID *string, idem string, status string,
	expiresAt time.Time, releasedAt, deliveredAt pgtype.Timestamptz,
	createdAt, updatedAt time.Time,
) inventory.Reservation {
	res := inventory.Reservation{
		ID:             id,
		StockItemID:    stockItemID,
		ProductID:      productID,
		StoreID:        storeID,
		MerchantID:     merchantID,
		OrderID:        orderID,
		CheckoutID:     checkoutID,
		IdempotencyKey: idem,
		Status:         status,
		ExpiresAt:      expiresAt,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}
	if releasedAt.Valid {
		t := releasedAt.Time
		res.ReleasedAt = &t
	}
	if deliveredAt.Valid {
		t := deliveredAt.Time
		res.DeliveredAt = &t
	}
	return res
}

func (r *InventoryRepo) InsertReservation(ctx context.Context, res inventory.Reservation) error {
	return r.queries(ctx).InsertStockReservation(ctx, gen.InsertStockReservationParams{
		ID:             res.ID,
		StockItemID:    res.StockItemID,
		ProductID:      res.ProductID,
		StoreID:        res.StoreID,
		MerchantID:     res.MerchantID,
		OrderID:        res.OrderID,
		CheckoutID:     res.CheckoutID,
		IdempotencyKey: res.IdempotencyKey,
		Status:         res.Status,
		ExpiresAt:      res.ExpiresAt,
		CreatedAt:      res.CreatedAt,
		UpdatedAt:      res.UpdatedAt,
	})
}

func (r *InventoryRepo) GetReservationByID(ctx context.Context, id string) (inventory.Reservation, error) {
	row, err := r.queries(ctx).GetStockReservationByID(ctx, id)
	if err != nil {
		return inventory.Reservation{}, err
	}
	return mapReservation(row.ID, row.StockItemID, row.ProductID, row.StoreID, row.MerchantID,
		row.OrderID, row.CheckoutID, row.IdempotencyKey, row.Status, row.ExpiresAt,
		row.ReleasedAt, row.DeliveredAt, row.CreatedAt, row.UpdatedAt), nil
}

func (r *InventoryRepo) GetReservationByIdempotency(ctx context.Context, productID, idempotencyKey string) (inventory.Reservation, error) {
	row, err := r.queries(ctx).GetStockReservationByIdempotency(ctx, gen.GetStockReservationByIdempotencyParams{
		ProductID:      productID,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		return inventory.Reservation{}, err
	}
	return mapReservation(row.ID, row.StockItemID, row.ProductID, row.StoreID, row.MerchantID,
		row.OrderID, row.CheckoutID, row.IdempotencyKey, row.Status, row.ExpiresAt,
		row.ReleasedAt, row.DeliveredAt, row.CreatedAt, row.UpdatedAt), nil
}

func (r *InventoryRepo) UpdateReservationStatus(ctx context.Context, id, from, to string, now time.Time) (bool, error) {
	n, err := r.queries(ctx).UpdateStockReservationStatus(ctx, gen.UpdateStockReservationStatusParams{
		ID:        id,
		Status:    to,
		UpdatedAt: now,
		Status_2:  from,
	})
	return n > 0, err
}

func (r *InventoryRepo) ListExpiredReservations(ctx context.Context, now time.Time, limit int32) ([]inventory.Reservation, error) {
	rows, err := r.queries(ctx).ListExpiredStockReservations(ctx, gen.ListExpiredStockReservationsParams{
		ExpiresAt: now,
		Limit:     limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]inventory.Reservation, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapReservation(row.ID, row.StockItemID, row.ProductID, row.StoreID, row.MerchantID,
			row.OrderID, row.CheckoutID, row.IdempotencyKey, row.Status, row.ExpiresAt,
			row.ReleasedAt, row.DeliveredAt, row.CreatedAt, row.UpdatedAt))
	}
	return out, nil
}

func (r *InventoryRepo) InsertRevealAudit(ctx context.Context, a inventory.RevealAudit) error {
	return r.queries(ctx).InsertStockRevealAudit(ctx, gen.InsertStockRevealAuditParams{
		ID:          a.ID,
		StockItemID: a.StockItemID,
		StoreID:     a.StoreID,
		ProductID:   a.ProductID,
		ActorUserID: a.ActorUserID,
		Reason:      a.Reason,
		MfaVerified: a.MFAVerified,
		PayloadHash: a.PayloadHash,
		CreatedAt:   a.CreatedAt,
	})
}
