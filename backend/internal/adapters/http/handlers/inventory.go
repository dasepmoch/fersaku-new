package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/inventory"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// InventoryHandler serves seller inventory schema/stock/reveal (BE-230).
type InventoryHandler struct {
	Svc *application.InventoryService
}

func (h *InventoryHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	items, err := h.Svc.ListProductSummaries(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, s := range items {
		out = append(out, productSummaryDTO(s))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *InventoryHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	sum, items, err := h.Svc.GetProductInventory(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "productId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	list := make([]map[string]any, 0, len(items))
	for _, it := range items {
		list = append(list, stockItemMaskedDTO(it))
	}
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"summary": productSummaryDTO(sum),
		"items":   list,
	})
}

func (h *InventoryHandler) GetSchema(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	sch, err := h.Svc.GetSchema(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "productId"))
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, schemaDTO(sch))
}

type putSchemaBody struct {
	ExpectedVersion *int32                 `json:"expectedVersion"`
	Fields          []inventory.FieldDef   `json:"fields"`
	Delimiter       string                 `json:"delimiter"`
}

func (h *InventoryHandler) PutSchema(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body putSchemaBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// If-Match can carry expected version as integer string.
	if body.ExpectedVersion == nil {
		if im := strings.TrimSpace(r.Header.Get("If-Match")); im != "" {
			im = strings.Trim(im, `"`)
			var v int32
			if _, err := parseInt32(im, &v); err == nil {
				body.ExpectedVersion = &v
			}
		}
	}
	sch, err := h.Svc.PutSchema(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "productId"), application.PutSchemaInput{
		ExpectedVersion: body.ExpectedVersion,
		Fields:          body.Fields,
		Delimiter:       body.Delimiter,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, schemaDTO(sch))
}

type importBody struct {
	ExpectedSchemaVersion int32               `json:"expectedSchemaVersion"`
	Items                 []map[string]string `json:"items"`
}

func (h *InventoryHandler) ImportItems(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body importBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	res, err := h.Svc.ImportItems(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "productId"), application.ImportItemsInput{
		ExpectedSchemaVersion: body.ExpectedSchemaVersion,
		Items:                 body.Items,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"imported": res.Imported,
		"itemIds":  res.ItemIDs,
	})
}

// ImportItemsGlobal is POST /v1/stores/{storeId}/inventory/items/import with productId in body.
func (h *InventoryHandler) ImportItemsGlobal(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body struct {
		ProductID             string              `json:"productId"`
		ExpectedSchemaVersion int32               `json:"expectedSchemaVersion"`
		Items                 []map[string]string `json:"items"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if strings.TrimSpace(body.ProductID) == "" {
		presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "productId required"))
		return
	}
	res, err := h.Svc.ImportItems(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), body.ProductID, application.ImportItemsInput{
		ExpectedSchemaVersion: body.ExpectedSchemaVersion,
		Items:                 body.Items,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, map[string]any{
		"imported": res.Imported,
		"itemIds":  res.ItemIDs,
	})
}

type revealBody struct {
	Reason string `json:"reason"`
	// mfaVerified body boolean is intentionally ignored (INT-140); proof is X-Recent-MFA-Proof.
}

func (h *InventoryHandler) Reveal(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body revealBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Recent MFA already validated + consumed by RequireRecentMFAProof middleware.
	res, err := h.Svc.RevealItem(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "itemId"), body.Reason, true)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// Per-item only; never cache secrets.
	w.Header().Set("Cache-Control", "private, no-store")
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"itemId":        res.ItemID,
		"productId":     res.ProductID,
		"schemaVersion": res.SchemaVersion,
		"status":        res.Status,
		"secrets":       res.Secrets,
		"masked":        res.Masked,
		"auditId":       res.AuditID,
	})
}

type revokeBody struct {
	Reason string `json:"reason"`
}

func (h *InventoryHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body revokeBody
	_ = decode.DecodeJSON(r, &body)
	item, err := h.Svc.RevokeItem(r.Context(), p.SubjectID, chi.URLParam(r, "storeId"), chi.URLParam(r, "itemId"), body.Reason)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, stockItemMaskedDTO(item))
}

// Reserve is an internal/checkout foundation endpoint (no public global reveal).
func (h *InventoryHandler) Reserve(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Inventory unavailable"))
		return
	}
	var body struct {
		StoreID    string `json:"storeId"`
		ProductID  string `json:"productId"`
		OrderID    string `json:"orderId"`
		CheckoutID string `json:"checkoutId"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	res, err := h.Svc.ReserveStock(r.Context(), application.ReserveStockRequest{
		StoreID:        body.StoreID,
		ProductID:      body.ProductID,
		OrderID:        body.OrderID,
		CheckoutID:     body.CheckoutID,
		IdempotencyKey: idem,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	status := http.StatusCreated
	if res.Replayed {
		status = http.StatusOK
	}
	presenters.WriteData(w, r, status, map[string]any{
		"reservation": stockReservationDTO(res.Reservation),
		"item":        stockItemMaskedDTO(res.Item),
		"replayed":    res.Replayed,
	})
}

func schemaDTO(s inventory.Schema) map[string]any {
	fields := make([]map[string]any, 0, len(s.Fields))
	for _, f := range s.Fields {
		fields = append(fields, map[string]any{
			"key":           f.Key,
			"label":         f.Label,
			"secret":        f.Secret,
			"required":      f.Required,
			"buyerCopyable": f.BuyerCopyable,
			"unique":        f.Unique,
		})
	}
	return map[string]any{
		"id":         s.ID,
		"productId":  s.ProductID,
		"storeId":    s.StoreID,
		"version":    s.Version,
		"fields":     fields,
		"delimiter":  s.Delimiter,
		"checksum":   s.Checksum,
		"createdAt":  s.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func productSummaryDTO(s inventory.ProductSummary) map[string]any {
	m := map[string]any{
		"productId": s.ProductID,
		"storeId":   s.StoreID,
		"available": s.Available,
		"reserved":  s.Reserved,
		"delivered": s.Delivered,
		"revoked":   s.Revoked,
		"total":     s.Total,
	}
	if s.ActiveSchemaVersion != nil {
		m["activeSchemaVersion"] = *s.ActiveSchemaVersion
	} else {
		m["activeSchemaVersion"] = nil
	}
	return m
}

func stockItemMaskedDTO(it inventory.StockItem) map[string]any {
	// Never include encrypted_payload or secrets.
	return map[string]any{
		"id":            it.ID,
		"productId":     it.ProductID,
		"storeId":       it.StoreID,
		"schemaVersion": it.SchemaVersion,
		"status":        it.Status,
		"masked":        it.MaskedPreview,
		"createdAt":     it.CreatedAt.UTC().Format(time.RFC3339),
		"updatedAt":     it.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func stockReservationDTO(r inventory.Reservation) map[string]any {
	m := map[string]any{
		"id":             r.ID,
		"stockItemId":    r.StockItemID,
		"productId":      r.ProductID,
		"storeId":        r.StoreID,
		"idempotencyKey": r.IdempotencyKey,
		"status":         r.Status,
		"expiresAt":      r.ExpiresAt.UTC().Format(time.RFC3339),
		"createdAt":      r.CreatedAt.UTC().Format(time.RFC3339),
	}
	if r.OrderID != nil {
		m["orderId"] = *r.OrderID
	}
	if r.CheckoutID != nil {
		m["checkoutId"] = *r.CheckoutID
	}
	return m
}

func parseInt32(s string, out *int32) (int, error) {
	var n int64
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			return 0, apperr.Validation(apperr.CodeValidationFailed, "invalid integer")
		}
		n = n*10 + int64(c-'0')
		if n > 1<<31-1 {
			return 0, apperr.Validation(apperr.CodeValidationFailed, "integer overflow")
		}
	}
	*out = int32(n)
	return int(n), nil
}
