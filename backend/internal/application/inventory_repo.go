package application

import (
	"context"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/inventory"
)

// InventoryProductRow is a minimal product projection for inventory.
type InventoryProductRow struct {
	ID                  string
	StoreID             string
	MerchantID          string
	Slug                string
	Title               string
	Type                string
	Status              string
	ActiveSchemaVersion *int32
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// InventoryStore is the persistence port for BE-230 inventory.
type InventoryStore interface {
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error

	GetStoreByID(ctx context.Context, storeID string) (CatalogStoreRow, error)
	UserCanAccessStore(ctx context.Context, userID, storeID string) (bool, error)
	UserIsPlatformAdmin(ctx context.Context, userID string) (bool, error)
	GetProduct(ctx context.Context, storeID, productID string) (InventoryProductRow, error)
	SetProductActiveSchema(ctx context.Context, storeID, productID string, version int32, now time.Time) error

	InsertSchema(ctx context.Context, s inventory.Schema) error
	GetSchemaByVersion(ctx context.Context, productID string, version int32) (inventory.Schema, error)
	GetActiveSchema(ctx context.Context, storeID, productID string) (inventory.Schema, error)
	MaxSchemaVersion(ctx context.Context, productID string) (int32, error)

	InsertStockItem(ctx context.Context, item inventory.StockItem) error
	GetStockItemByID(ctx context.Context, storeID, itemID string) (inventory.StockItem, error)
	ListStockItemsByProduct(ctx context.Context, storeID, productID string, limit int32) ([]inventory.StockItem, error)
	CountStockByStatus(ctx context.Context, storeID, productID string) (map[string]int64, error)
	ListProductSummaries(ctx context.Context, storeID string) ([]inventory.ProductSummary, error)

	// ClaimAvailableStockItem locks one AVAILABLE unit with FOR UPDATE SKIP LOCKED.
	ClaimAvailableStockItem(ctx context.Context, storeID, productID string) (inventory.StockItem, error)
	UpdateStockItemStatus(ctx context.Context, id, from, to string, now time.Time) (bool, error)

	InsertReservation(ctx context.Context, r inventory.Reservation) error
	GetReservationByID(ctx context.Context, id string) (inventory.Reservation, error)
	GetReservationByIdempotency(ctx context.Context, productID, idempotencyKey string) (inventory.Reservation, error)
	UpdateReservationStatus(ctx context.Context, id, from, to string, now time.Time) (bool, error)
	ListExpiredReservations(ctx context.Context, now time.Time, limit int32) ([]inventory.Reservation, error)

	InsertRevealAudit(ctx context.Context, a inventory.RevealAudit) error

	IsNotFound(err error) bool
	IsUniqueViolation(err error) bool
}
