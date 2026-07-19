package application

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"strings"
	"time"

	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/inventory"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
	"github.com/dasepmoch/fersaku-new/backend/internal/ports"
	"github.com/dasepmoch/fersaku-new/backend/internal/security"
)

// DefaultStockReservationTTL is checkout hold duration without payment finalization.
const DefaultStockReservationTTL = 30 * time.Minute

// InventoryService implements schema/import/reserve/reveal (BE-230).
type InventoryService struct {
	Store         InventoryStore
	IDs           ports.IDGenerator
	Clock         ports.Clock
	Log           ports.Logger
	EncryptionKey string // STOCK or KYC key; never log
}

func (s *InventoryService) now() time.Time {
	if s.Clock != nil {
		return s.Clock.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *InventoryService) requireStoreAccess(ctx context.Context, userID, storeID string) (CatalogStoreRow, error) {
	if userID == "" {
		return CatalogStoreRow{}, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required")
	}
	if storeID == "" {
		return CatalogStoreRow{}, inventory.ErrNotFound
	}
	st, err := s.Store.GetStoreByID(ctx, storeID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return CatalogStoreRow{}, inventory.ErrNotFound
		}
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Store lookup failed")
	}
	admin, err := s.Store.UserIsPlatformAdmin(ctx, userID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if admin {
		return st, nil
	}
	ok, err := s.Store.UserCanAccessStore(ctx, userID, storeID)
	if err != nil {
		return CatalogStoreRow{}, apperr.Internal(apperr.CodeInternalError, "Authorization check failed")
	}
	if !ok {
		return CatalogStoreRow{}, inventory.ErrNotFound
	}
	return st, nil
}

func (s *InventoryService) requireProduct(ctx context.Context, storeID, productID string) (InventoryProductRow, error) {
	p, err := s.Store.GetProduct(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return InventoryProductRow{}, inventory.ErrNotFound
		}
		return InventoryProductRow{}, apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
	}
	return p, nil
}

func (s *InventoryService) encryptionSecret() (string, error) {
	k := strings.TrimSpace(s.EncryptionKey)
	if k == "" {
		return "", inventory.ErrEncryptionConfig
	}
	return k, nil
}

// --- schema ---

// PutSchemaInput creates a new immutable schema version (expected version concurrency).
type PutSchemaInput struct {
	ExpectedVersion *int32 // nil means no active schema expected (first create)
	Fields          []inventory.FieldDef
	Delimiter       string
}

// GetSchema returns the active schema for a product (or empty if none).
func (s *InventoryService) GetSchema(ctx context.Context, userID, storeID, productID string) (inventory.Schema, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return inventory.Schema{}, err
	}
	if _, err := s.requireProduct(ctx, storeID, productID); err != nil {
		return inventory.Schema{}, err
	}
	sch, err := s.Store.GetActiveSchema(ctx, storeID, productID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return inventory.Schema{}, inventory.ErrNotFound
		}
		return inventory.Schema{}, apperr.Internal(apperr.CodeInternalError, "Schema lookup failed")
	}
	return sch, nil
}

// PutSchema creates a new immutable schema version and points product active_schema_version.
func (s *InventoryService) PutSchema(ctx context.Context, userID, storeID, productID string, in PutSchemaInput) (inventory.Schema, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID)
	if err != nil {
		return inventory.Schema{}, err
	}
	prod, err := s.requireProduct(ctx, storeID, productID)
	if err != nil {
		return inventory.Schema{}, err
	}
	_ = catalog.TypeCode // inventory primarily for code products; schema allowed on any type for prep
	_ = prod
	fields := make([]inventory.FieldDef, len(in.Fields))
	copy(fields, in.Fields)
	delim := in.Delimiter
	if delim == "" {
		delim = ","
	}
	if err := inventory.ValidateSchemaFields(fields, delim); err != nil {
		return inventory.Schema{}, err
	}
	checksum, err := inventory.SchemaChecksum(fields, delim)
	if err != nil {
		return inventory.Schema{}, apperr.Internal(apperr.CodeInternalError, "Schema checksum failed")
	}

	var created inventory.Schema
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Re-read product under TX for optimistic concurrency on active_schema_version.
		p, err := s.Store.GetProduct(ctx, storeID, productID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return inventory.ErrNotFound
			}
			return apperr.Internal(apperr.CodeInternalError, "Product lookup failed")
		}
		var current *int32
		current = p.ActiveSchemaVersion
		if in.ExpectedVersion == nil {
			if current != nil {
				return inventory.ErrSchemaConflict
			}
		} else {
			if current == nil || *current != *in.ExpectedVersion {
				return inventory.ErrSchemaConflict
			}
		}
		maxV, err := s.Store.MaxSchemaVersion(ctx, productID)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Schema version lookup failed")
		}
		next := maxV + 1
		if next < 1 {
			next = 1
		}
		now := s.now()
		uid := userID
		created = inventory.Schema{
			ID:         s.IDs.New(),
			ProductID:  productID,
			StoreID:    storeID,
			MerchantID: st.MerchantID,
			Version:    next,
			Fields:     fields,
			Delimiter:  delim,
			Checksum:   checksum,
			CreatedBy:  &uid,
			CreatedAt:  now,
		}
		if err := s.Store.InsertSchema(ctx, created); err != nil {
			if s.Store.IsUniqueViolation(err) {
				return inventory.ErrSchemaConflict
			}
			return apperr.Internal(apperr.CodeInternalError, "Schema insert failed")
		}
		if err := s.Store.SetProductActiveSchema(ctx, storeID, productID, next, now); err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Activate schema failed")
		}
		return nil
	})
	if err != nil {
		return inventory.Schema{}, err
	}
	return created, nil
}

// --- list / summary ---

// ListProductSummaries returns masked stock counts per product.
func (s *InventoryService) ListProductSummaries(ctx context.Context, userID, storeID string) ([]inventory.ProductSummary, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return nil, err
	}
	items, err := s.Store.ListProductSummaries(ctx, storeID)
	if err != nil {
		return nil, apperr.Internal(apperr.CodeInternalError, "List inventory products failed")
	}
	return items, nil
}

// GetProductInventory returns summary + masked items for one product.
func (s *InventoryService) GetProductInventory(ctx context.Context, userID, storeID, productID string) (inventory.ProductSummary, []inventory.StockItem, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return inventory.ProductSummary{}, nil, err
	}
	prod, err := s.requireProduct(ctx, storeID, productID)
	if err != nil {
		return inventory.ProductSummary{}, nil, err
	}
	counts, err := s.Store.CountStockByStatus(ctx, storeID, productID)
	if err != nil {
		return inventory.ProductSummary{}, nil, apperr.Internal(apperr.CodeInternalError, "Count stock failed")
	}
	sum := inventory.ProductSummary{
		ProductID:           productID,
		StoreID:             storeID,
		Title:               prod.Title,
		Type:                prod.Type,
		ActiveSchemaVersion: prod.ActiveSchemaVersion,
		Available:           counts[inventory.StatusAvailable],
		Reserved:            counts[inventory.StatusReserved],
		Delivered:           counts[inventory.StatusDelivered],
		Revoked:             counts[inventory.StatusRevoked],
	}
	sum.Total = sum.Available + sum.Reserved + sum.Delivered + sum.Revoked
	items, err := s.Store.ListStockItemsByProduct(ctx, storeID, productID, 100)
	if err != nil {
		return inventory.ProductSummary{}, nil, apperr.Internal(apperr.CodeInternalError, "List stock items failed")
	}
	// Strip ciphertext from service return for list path (handlers must not expose).
	for i := range items {
		items[i].EncryptedPayload = nil
	}
	return sum, items, nil
}

// --- import ---

// ImportItemsInput is a batch of field-value maps bound to expected schema version.
type ImportItemsInput struct {
	ExpectedSchemaVersion int32
	Items                 []map[string]string
}

// ImportResult summarizes batch import.
type ImportResult struct {
	Imported int
	ItemIDs  []string
}

// ImportItems validates against active schema and inserts encrypted stock units atomically.
func (s *InventoryService) ImportItems(ctx context.Context, userID, storeID, productID string, in ImportItemsInput) (ImportResult, error) {
	st, err := s.requireStoreAccess(ctx, userID, storeID)
	if err != nil {
		return ImportResult{}, err
	}
	if _, err := s.requireProduct(ctx, storeID, productID); err != nil {
		return ImportResult{}, err
	}
	if len(in.Items) == 0 {
		return ImportResult{}, apperr.Validation(apperr.CodeValidationFailed, "Import requires at least one item")
	}
	if len(in.Items) > inventory.MaxImportBatch() {
		return ImportResult{}, apperr.Validation(apperr.CodeValidationFailed, "Import batch too large")
	}
	secret, err := s.encryptionSecret()
	if err != nil {
		return ImportResult{}, err
	}

	var result ImportResult
	err = s.Store.WithTx(ctx, func(ctx context.Context) error {
		sch, err := s.Store.GetActiveSchema(ctx, storeID, productID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return inventory.ErrImportStaleSchema
			}
			return apperr.Internal(apperr.CodeInternalError, "Schema lookup failed")
		}
		if sch.Version != in.ExpectedSchemaVersion {
			return inventory.ErrImportStaleSchema
		}
		now := s.now()
		uid := userID
		ids := make([]string, 0, len(in.Items))
		for _, raw := range in.Items {
			norm, uh, err := inventory.ValidateImportRow(sch, raw)
			if err != nil {
				return err
			}
			payload, err := json.Marshal(norm)
			if err != nil {
				return apperr.Internal(apperr.CodeInternalError, "Encode stock payload failed")
			}
			keyVer, ct, err := security.EncryptAEAD(secret, payload)
			if err != nil {
				return inventory.ErrEncryptionConfig
			}
			// Never log plaintext payload.
			_ = payload
			masked := inventory.MaskValues(sch, norm)
			itemID := s.IDs.New()
			item := inventory.StockItem{
				ID:               itemID,
				ProductID:        productID,
				StoreID:          storeID,
				MerchantID:       st.MerchantID,
				SchemaVersion:    sch.Version,
				Status:           inventory.StatusAvailable,
				EncryptedPayload: ct,
				KeyVersion:       keyVer,
				MaskedPreview:    masked,
				UniqueKeyHash:    uh,
				CreatedBy:        &uid,
				CreatedAt:        now,
				UpdatedAt:        now,
			}
			if err := s.Store.InsertStockItem(ctx, item); err != nil {
				if s.Store.IsUniqueViolation(err) {
					return apperr.Conflict(apperr.CodeConflict, "Duplicate stock unique key in import")
				}
				return apperr.Internal(apperr.CodeInternalError, "Insert stock item failed")
			}
			ids = append(ids, itemID)
		}
		result = ImportResult{Imported: len(ids), ItemIDs: ids}
		return nil
	})
	if err != nil {
		return ImportResult{}, err
	}
	return result, nil
}

// --- reserve / release / allocate ---

// ReserveStockRequest claims one AVAILABLE unit for checkout/order.
type ReserveStockRequest struct {
	StoreID        string
	ProductID      string
	OrderID        string
	CheckoutID     string
	IdempotencyKey string
	TTL            time.Duration
}

// ReserveStockResult is the held unit (masked only).
type ReserveStockResult struct {
	Reservation inventory.Reservation
	Item        inventory.StockItem // EncryptedPayload cleared
	Replayed    bool
}

// ReserveStock atomically claims one unit with FOR UPDATE SKIP LOCKED.
func (s *InventoryService) ReserveStock(ctx context.Context, req ReserveStockRequest) (ReserveStockResult, error) {
	if req.ProductID == "" || req.StoreID == "" {
		return ReserveStockResult{}, apperr.Validation(apperr.CodeValidationFailed, "storeId and productId required")
	}
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		return ReserveStockResult{}, apperr.Validation(apperr.CodeValidationFailed, "Idempotency-Key required")
	}
	if req.OrderID == "" && req.CheckoutID == "" {
		return ReserveStockResult{}, apperr.Validation(apperr.CodeValidationFailed, "orderId or checkoutId required")
	}
	ttl := req.TTL
	if ttl <= 0 {
		ttl = DefaultStockReservationTTL
	}

	// Idempotent replay outside TX first.
	if existing, err := s.Store.GetReservationByIdempotency(ctx, req.ProductID, req.IdempotencyKey); err == nil {
		item, ierr := s.Store.GetStockItemByID(ctx, req.StoreID, existing.StockItemID)
		if ierr != nil && !s.Store.IsNotFound(ierr) {
			return ReserveStockResult{}, apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
		}
		item.EncryptedPayload = nil
		return ReserveStockResult{Reservation: existing, Item: item, Replayed: true}, nil
	} else if !s.Store.IsNotFound(err) {
		return ReserveStockResult{}, apperr.Internal(apperr.CodeInternalError, "Reservation lookup failed")
	}

	var out ReserveStockResult
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		// Replay under lock.
		if existing, err := s.Store.GetReservationByIdempotency(ctx, req.ProductID, req.IdempotencyKey); err == nil {
			item, ierr := s.Store.GetStockItemByID(ctx, req.StoreID, existing.StockItemID)
			if ierr != nil && !s.Store.IsNotFound(ierr) {
				return apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
			}
			item.EncryptedPayload = nil
			out = ReserveStockResult{Reservation: existing, Item: item, Replayed: true}
			return nil
		} else if !s.Store.IsNotFound(err) {
			return apperr.Internal(apperr.CodeInternalError, "Reservation lookup failed")
		}

		item, err := s.Store.ClaimAvailableStockItem(ctx, req.StoreID, req.ProductID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return inventory.ErrOutOfStock
			}
			return apperr.Internal(apperr.CodeInternalError, "Claim stock failed")
		}
		now := s.now()
		ok, err := s.Store.UpdateStockItemStatus(ctx, item.ID, inventory.StatusAvailable, inventory.StatusReserved, now)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Reserve stock status failed")
		}
		if !ok {
			return inventory.ErrOutOfStock
		}
		var orderID, checkoutID *string
		if req.OrderID != "" {
			o := req.OrderID
			orderID = &o
		}
		if req.CheckoutID != "" {
			c := req.CheckoutID
			checkoutID = &c
		}
		res := inventory.Reservation{
			ID:             s.IDs.New(),
			StockItemID:    item.ID,
			ProductID:      req.ProductID,
			StoreID:        req.StoreID,
			MerchantID:     item.MerchantID,
			OrderID:        orderID,
			CheckoutID:     checkoutID,
			IdempotencyKey: req.IdempotencyKey,
			Status:         inventory.ReservationReserved,
			ExpiresAt:      now.Add(ttl),
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := s.Store.InsertReservation(ctx, res); err != nil {
			if s.Store.IsUniqueViolation(err) {
				// Concurrent idempotency race — replay.
				existing, gerr := s.Store.GetReservationByIdempotency(ctx, req.ProductID, req.IdempotencyKey)
				if gerr != nil {
					return inventory.ErrOutOfStock
				}
				item.EncryptedPayload = nil
				out = ReserveStockResult{Reservation: existing, Item: item, Replayed: true}
				return nil
			}
			return apperr.Internal(apperr.CodeInternalError, "Insert reservation failed")
		}
		item.Status = inventory.StatusReserved
		item.EncryptedPayload = nil
		out = ReserveStockResult{Reservation: res, Item: item, Replayed: false}
		return nil
	})
	if err != nil {
		return ReserveStockResult{}, err
	}
	return out, nil
}

// ReleaseReservation releases a hold and returns stock to AVAILABLE when still RESERVED.
func (s *InventoryService) ReleaseReservation(ctx context.Context, reservationID string) (inventory.Reservation, error) {
	var out inventory.Reservation
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		res, err := s.Store.GetReservationByID(ctx, reservationID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return inventory.ErrNotFound
			}
			return apperr.Internal(apperr.CodeInternalError, "Reservation lookup failed")
		}
		if res.Status == inventory.ReservationReleased {
			out = res
			return nil
		}
		if res.Status != inventory.ReservationReserved && res.Status != inventory.ReservationHeldUnknown {
			return inventory.ErrReservationState
		}
		now := s.now()
		ok, err := s.Store.UpdateReservationStatus(ctx, res.ID, res.Status, inventory.ReservationReleased, now)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Release reservation failed")
		}
		if !ok {
			return inventory.ErrReservationState
		}
		// Return unit only if still RESERVED (not delivered).
		_, _ = s.Store.UpdateStockItemStatus(ctx, res.StockItemID, inventory.StatusReserved, inventory.StatusAvailable, now)
		res.Status = inventory.ReservationReleased
		res.ReleasedAt = &now
		res.UpdatedAt = now
		out = res
		return nil
	})
	return out, err
}

// AllocateOnFulfillment marks reserved stock DELIVERED for paid fulfillment (CODE type).
func (s *InventoryService) AllocateOnFulfillment(ctx context.Context, reservationID string) (inventory.Reservation, inventory.StockItem, error) {
	var resOut inventory.Reservation
	var itemOut inventory.StockItem
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		res, err := s.Store.GetReservationByID(ctx, reservationID)
		if err != nil {
			if s.Store.IsNotFound(err) {
				return inventory.ErrNotFound
			}
			return apperr.Internal(apperr.CodeInternalError, "Reservation lookup failed")
		}
		if res.Status == inventory.ReservationDelivered {
			item, ierr := s.Store.GetStockItemByID(ctx, res.StoreID, res.StockItemID)
			if ierr != nil {
				return apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
			}
			item.EncryptedPayload = nil
			resOut, itemOut = res, item
			return nil
		}
		if res.Status != inventory.ReservationReserved && res.Status != inventory.ReservationHeldUnknown {
			return inventory.ErrReservationState
		}
		now := s.now()
		ok, err := s.Store.UpdateReservationStatus(ctx, res.ID, res.Status, inventory.ReservationDelivered, now)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Deliver reservation failed")
		}
		if !ok {
			return inventory.ErrReservationState
		}
		ok, err = s.Store.UpdateStockItemStatus(ctx, res.StockItemID, inventory.StatusReserved, inventory.StatusDelivered, now)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Deliver stock failed")
		}
		if !ok {
			// try from AVAILABLE edge case
			ok, err = s.Store.UpdateStockItemStatus(ctx, res.StockItemID, inventory.StatusAvailable, inventory.StatusDelivered, now)
			if err != nil || !ok {
				return inventory.ErrItemState
			}
		}
		item, err := s.Store.GetStockItemByID(ctx, res.StoreID, res.StockItemID)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
		}
		item.EncryptedPayload = nil
		res.Status = inventory.ReservationDelivered
		res.DeliveredAt = &now
		res.UpdatedAt = now
		resOut, itemOut = res, item
		return nil
	})
	return resOut, itemOut, err
}

// ExpireReservations releases expired holds (worker hook).
func (s *InventoryService) ExpireReservations(ctx context.Context, limit int32) (int, error) {
	if limit <= 0 {
		limit = 50
	}
	now := s.now()
	n := 0
	err := s.Store.WithTx(ctx, func(ctx context.Context) error {
		rows, err := s.Store.ListExpiredReservations(ctx, now, limit)
		if err != nil {
			return apperr.Internal(apperr.CodeInternalError, "List expired stock reservations failed")
		}
		for _, res := range rows {
			ok, err := s.Store.UpdateReservationStatus(ctx, res.ID, inventory.ReservationReserved, inventory.ReservationReleased, now)
			if err != nil {
				return apperr.Internal(apperr.CodeInternalError, "Expire reservation failed")
			}
			if !ok {
				continue
			}
			_, _ = s.Store.UpdateStockItemStatus(ctx, res.StockItemID, inventory.StatusReserved, inventory.StatusAvailable, now)
			n++
		}
		return nil
	})
	return n, err
}

// --- reveal / revoke ---

// RevealResult returns decrypted secrets once; transport must set Cache-Control no-store.
type RevealResult struct {
	ItemID        string
	ProductID     string
	SchemaVersion int32
	Status        string
	Secrets       map[string]string
	Masked        map[string]string
	AuditID       string
}

// RevealItem decrypts one stock unit for a permissioned seller with audit reason.
// mfaVerified is a policy stub flag for recent-MFA gating (caller sets true when session has fresh MFA).
func (s *InventoryService) RevealItem(ctx context.Context, userID, storeID, itemID, reason string, mfaVerified bool) (RevealResult, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return RevealResult{}, err
	}
	reason = strings.TrimSpace(reason)
	if reason == "" || len(reason) > 500 {
		return RevealResult{}, apperr.Validation(apperr.CodeValidationFailed, "Reveal reason is required")
	}
	secret, err := s.encryptionSecret()
	if err != nil {
		return RevealResult{}, err
	}
	item, err := s.Store.GetStockItemByID(ctx, storeID, itemID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return RevealResult{}, inventory.ErrNotFound
		}
		return RevealResult{}, apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
	}
	if item.Status == inventory.StatusRevoked {
		return RevealResult{}, inventory.ErrRevealDenied
	}
	plain, err := security.DecryptAEAD(secret, item.EncryptedPayload)
	if err != nil {
		return RevealResult{}, apperr.Internal(apperr.CodeInternalError, "Decrypt stock failed")
	}
	var values map[string]string
	if err := json.Unmarshal(plain, &values); err != nil {
		return RevealResult{}, apperr.Internal(apperr.CodeInternalError, "Decode stock payload failed")
	}
	// Hash of ciphertext for audit (never store plaintext).
	sum := sha256.Sum256(item.EncryptedPayload)
	auditID := s.IDs.New()
	now := s.now()
	if err := s.Store.InsertRevealAudit(ctx, inventory.RevealAudit{
		ID:          auditID,
		StockItemID: item.ID,
		StoreID:     item.StoreID,
		ProductID:   item.ProductID,
		ActorUserID: userID,
		Reason:      reason,
		MFAVerified: mfaVerified,
		PayloadHash: sum[:],
		CreatedAt:   now,
	}); err != nil {
		return RevealResult{}, apperr.Internal(apperr.CodeInternalError, "Reveal audit failed")
	}
	if s.Log != nil {
		s.Log.Info("stock reveal",
			"item_id", item.ID,
			"product_id", item.ProductID,
			"actor", userID,
			"mfa", mfaVerified,
			// never log secrets
		)
	}
	return RevealResult{
		ItemID:        item.ID,
		ProductID:     item.ProductID,
		SchemaVersion: item.SchemaVersion,
		Status:        item.Status,
		Secrets:       values,
		Masked:        item.MaskedPreview,
		AuditID:       auditID,
	}, nil
}

// RevokeItem marks a unit REVOKED so it cannot be reserved or revealed.
func (s *InventoryService) RevokeItem(ctx context.Context, userID, storeID, itemID, reason string) (inventory.StockItem, error) {
	if _, err := s.requireStoreAccess(ctx, userID, storeID); err != nil {
		return inventory.StockItem{}, err
	}
	_ = reason
	item, err := s.Store.GetStockItemByID(ctx, storeID, itemID)
	if err != nil {
		if s.Store.IsNotFound(err) {
			return inventory.StockItem{}, inventory.ErrNotFound
		}
		return inventory.StockItem{}, apperr.Internal(apperr.CodeInternalError, "Stock item lookup failed")
	}
	if item.Status == inventory.StatusRevoked {
		item.EncryptedPayload = nil
		return item, nil
	}
	if item.Status == inventory.StatusDelivered {
		return inventory.StockItem{}, inventory.ErrItemState
	}
	now := s.now()
	from := item.Status
	ok, err := s.Store.UpdateStockItemStatus(ctx, item.ID, from, inventory.StatusRevoked, now)
	if err != nil {
		return inventory.StockItem{}, apperr.Internal(apperr.CodeInternalError, "Revoke stock failed")
	}
	if !ok {
		return inventory.StockItem{}, inventory.ErrItemState
	}
	item.Status = inventory.StatusRevoked
	item.RevokedAt = &now
	item.UpdatedAt = now
	item.EncryptedPayload = nil
	return item, nil
}
