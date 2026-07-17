package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/catalog"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// CatalogHandler serves §7.4 public catalog and §7.5 seller product/storefront (BE-210).
type CatalogHandler struct {
	Svc *application.CatalogService
}

// --- seller products ---

func (h *CatalogHandler) ListProducts(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	items, err := h.Svc.ListProducts(r.Context(), p.SubjectID, storeID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, productDTO(it, true))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *CatalogHandler) CreateProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	var body productWriteBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	price, err := parseMoneyField(body.Price, "price")
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var minPtr *int64
	if body.MinimumPrice != nil {
		m, err := parseMoneyField(body.MinimumPrice, "minimumPrice")
		if err != nil {
			presenters.WriteAppError(w, r, err)
			return
		}
		minPtr = &m
	}
	storeID := chi.URLParam(r, "storeId")
	prod, err := h.Svc.CreateProduct(r.Context(), p.SubjectID, storeID, application.CreateProductInput{
		Slug:         body.Slug,
		Title:        body.Title,
		Short:        body.Short,
		Description:  body.Description,
		Price:        price,
		Type:         body.Type,
		Badge:        body.Badge,
		Palette:      body.Palette,
		Glyph:        body.Glyph,
		Includes:     body.Includes,
		AllowPWYT:    body.AllowPayWhatYouWant,
		MinimumPrice: minPtr,
		Version:      body.CurrentVersion,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, productDTO(prod, true))
}

func (h *CatalogHandler) GetProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	productID := chi.URLParam(r, "productId")
	prod, err := h.Svc.GetProduct(r.Context(), p.SubjectID, storeID, productID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, productDTO(prod, true))
}

func (h *CatalogHandler) PatchProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	var body productPatchBody
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	in := application.PatchProductInput{
		Slug:        body.Slug,
		Title:       body.Title,
		Short:       body.Short,
		Description: body.Description,
		Type:        body.Type,
		Badge:       body.Badge,
		Palette:     body.Palette,
		Glyph:       body.Glyph,
		Includes:    body.Includes,
		AllowPWYT:   body.AllowPayWhatYouWant,
		Version:     body.CurrentVersion,
	}
	if body.Price != nil {
		price, err := parseMoneyField(body.Price, "price")
		if err != nil {
			presenters.WriteAppError(w, r, err)
			return
		}
		in.Price = &price
	}
	if body.MinimumPriceCleared {
		in.ClearMin = true
	} else if body.MinimumPrice != nil {
		m, err := parseMoneyField(body.MinimumPrice, "minimumPrice")
		if err != nil {
			presenters.WriteAppError(w, r, err)
			return
		}
		in.MinimumPrice = &m
	}
	storeID := chi.URLParam(r, "storeId")
	productID := chi.URLParam(r, "productId")
	prod, err := h.Svc.PatchProduct(r.Context(), p.SubjectID, storeID, productID, in)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, productDTO(prod, true))
}

func (h *CatalogHandler) PublishProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	// Optional empty body.
	if r.ContentLength > 0 {
		var body map[string]any
		_ = decode.DecodeJSON(r, &body)
	}
	storeID := chi.URLParam(r, "storeId")
	productID := chi.URLParam(r, "productId")
	prod, err := h.Svc.PublishProduct(r.Context(), p.SubjectID, storeID, productID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rid := reqctx.RequestID(r.Context())
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"accepted":  true,
		"productId": prod.ID,
		"requestId": rid,
		"product":   productDTO(prod, true),
	})
}

func (h *CatalogHandler) ArchiveProduct(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	productID := chi.URLParam(r, "productId")
	prod, err := h.Svc.ArchiveProduct(r.Context(), p.SubjectID, storeID, productID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, productDTO(prod, true))
}

// --- storefront studio ---

func (h *CatalogHandler) GetStorefront(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	storeID := chi.URLParam(r, "storeId")
	out, err := h.Svc.GetStorefront(r.Context(), p.SubjectID, storeID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *CatalogHandler) PutStorefrontDraft(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	var raw map[string]any
	if err := decode.DecodeJSON(r, &raw); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	var expectedRevision *int32
	if v, ok := raw["expectedRevision"]; ok {
		switch n := v.(type) {
		case float64:
			r := int32(n)
			expectedRevision = &r
		}
	}
	expectedETag, _ := raw["expectedETag"].(string)
	var cfg json.RawMessage
	if c, ok := raw["config"]; ok {
		b, err := json.Marshal(c)
		if err != nil {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid storefront config"))
			return
		}
		cfg = b
	} else {
		delete(raw, "expectedRevision")
		delete(raw, "expectedETag")
		b, err := json.Marshal(raw)
		if err != nil {
			presenters.WriteAppError(w, r, apperr.Validation(apperr.CodeValidationFailed, "Invalid storefront config"))
			return
		}
		cfg = b
	}
	ifMatch := r.Header.Get("If-Match")
	if expectedETag == "" && ifMatch != "" {
		expectedETag = strings.Trim(strings.TrimSpace(ifMatch), `"`)
	}
	storeID := chi.URLParam(r, "storeId")
	rev, err := h.Svc.PutStorefrontDraft(r.Context(), p.SubjectID, storeID, application.PutStorefrontDraftInput{
		Config:           cfg,
		ExpectedRevision: expectedRevision,
		ExpectedETag:     expectedETag,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	w.Header().Set("ETag", rev.ETag)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"revision": rev.Revision,
		"etag":     rev.ETag,
		"status":   string(rev.Status),
		"config":   json.RawMessage(rev.Config),
	})
}

func (h *CatalogHandler) PublishStorefront(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	var body struct {
		Config           json.RawMessage `json:"config"`
		ExpectedRevision *int32          `json:"expectedRevision"`
		ExpectedETag     string          `json:"expectedETag"`
		Revision         *int32          `json:"revision"` // alias
	}
	if r.ContentLength > 0 {
		if err := decode.DecodeJSON(r, &body); err != nil {
			// tolerate empty / partial
			_ = err
		}
	}
	if body.ExpectedRevision == nil && body.Revision != nil {
		body.ExpectedRevision = body.Revision
	}
	ifMatch := r.Header.Get("If-Match")
	storeID := chi.URLParam(r, "storeId")
	res, err := h.Svc.PublishStorefront(r.Context(), p.SubjectID, storeID, application.PublishStorefrontInput{
		Config:           body.Config,
		ExpectedRevision: body.ExpectedRevision,
		ExpectedETag:     body.ExpectedETag,
		IfMatch:          ifMatch,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	rid := reqctx.RequestID(r.Context())
	w.Header().Set("ETag", res.ETag)
	presenters.WriteData(w, r, http.StatusOK, map[string]any{
		"accepted":  true,
		"revision":  res.Revision,
		"etag":      res.ETag,
		"requestId": rid,
		"storeId":   res.StoreID,
	})
}

// --- public ---

func (h *CatalogHandler) PublicStore(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	slug := chi.URLParam(r, "slug")
	sf, err := h.Svc.GetPublicStorefront(r.Context(), slug)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	if sf.ETag != "" {
		w.Header().Set("ETag", sf.ETag)
	}
	presenters.WriteData(w, r, http.StatusOK, publicStorefrontDTO(sf))
}

func (h *CatalogHandler) PublicFeatured(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	limit := 6
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil {
			limit = n
		}
	}
	items, err := h.Svc.ListFeaturedProducts(r.Context(), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, productDTO(it, false))
	}
	presenters.WriteData(w, r, http.StatusOK, out)
}

func (h *CatalogHandler) PublicProduct(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Catalog unavailable"))
		return
	}
	idOrSlug := chi.URLParam(r, "idOrSlug")
	prod, err := h.Svc.GetPublicProduct(r.Context(), idOrSlug)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	// FE findPublicProduct expects { product, store } or product — return product with store slug context
	presenters.WriteData(w, r, http.StatusOK, productDTO(prod, false))
}

// --- DTO helpers (CatalogProduct-compatible) ---

type productWriteBody struct {
	Slug                string   `json:"slug"`
	Title               string   `json:"title"`
	Short               string   `json:"short"`
	Description         string   `json:"description"`
	Price               any      `json:"price"`
	Type                string   `json:"type"`
	Badge               string   `json:"badge"`
	Palette             string   `json:"palette"`
	Glyph               string   `json:"glyph"`
	Includes            []string `json:"includes"`
	AllowPayWhatYouWant bool     `json:"allowPayWhatYouWant"`
	MinimumPrice        any      `json:"minimumPrice"`
	CurrentVersion      string   `json:"currentVersion"`
}

type productPatchBody struct {
	Slug                *string   `json:"slug"`
	Title               *string   `json:"title"`
	Short               *string   `json:"short"`
	Description         *string   `json:"description"`
	Price               any       `json:"price"`
	Type                *string   `json:"type"`
	Badge               *string   `json:"badge"`
	Palette             *string   `json:"palette"`
	Glyph               *string   `json:"glyph"`
	Includes            *[]string `json:"includes"`
	AllowPayWhatYouWant *bool     `json:"allowPayWhatYouWant"`
	MinimumPrice        any       `json:"minimumPrice"`
	MinimumPriceCleared bool      `json:"minimumPriceCleared"`
	CurrentVersion      *string   `json:"currentVersion"`
}

// parseMoneyField accepts JSON numbers only as whole integers (reject float fractions).
func parseMoneyField(v any, field string) (int64, error) {
	if v == nil {
		return 0, apperr.Validation(apperr.CodeValidationFailed, field+" is required")
	}
	switch n := v.(type) {
	case float64:
		// encoding/json uses float64 for numbers — reject non-integers.
		if n != float64(int64(n)) {
			return 0, apperr.Validation(apperr.CodeValidationFailed, field+" must be a whole IDR integer")
		}
		return int64(n), nil
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, apperr.Validation(apperr.CodeValidationFailed, field+" must be a whole IDR integer")
		}
		return i, nil
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case string:
		// Reject string money to avoid float parsing ambiguity.
		return 0, apperr.Validation(apperr.CodeValidationFailed, field+" must be a whole IDR integer")
	default:
		return 0, apperr.Validation(apperr.CodeValidationFailed, field+" must be a whole IDR integer")
	}
}

func productDTO(p catalog.Product, seller bool) map[string]any {
	out := map[string]any{
		"id":          p.ID,
		"slug":        p.Slug,
		"title":       p.Title,
		"short":       p.Short,
		"description": p.Description,
		"price":       p.PriceIDR, // int64 whole IDR — CatalogProduct.price
		"type":        string(p.Type),
		"sales":       p.Sales,
		"palette":     p.Palette,
		"glyph":       p.Glyph,
		"includes":    p.Includes,
	}
	if p.Badge != "" {
		out["badge"] = p.Badge
	}
	if p.AllowPWYT {
		out["allowPayWhatYouWant"] = true
	}
	if p.MinimumPriceIDR != nil {
		out["minimumPrice"] = *p.MinimumPriceIDR
	}
	if p.Version != "" {
		out["currentVersion"] = p.Version
		out["updatesEnabled"] = true
	}
	if seller {
		out["status"] = string(p.Status)
		out["storeId"] = p.StoreID
		out["merchantId"] = p.MerchantID
		if p.PublishedAt != nil {
			out["publishedAt"] = p.PublishedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
		}
	}
	return out
}

func publicStorefrontDTO(sf catalog.PublicStorefront) map[string]any {
	products := make([]map[string]any, 0, len(sf.Products))
	for _, p := range sf.Products {
		products = append(products, productDTO(p, false))
	}
	out := map[string]any{
		"slug":               sf.Slug,
		"name":               sf.Name,
		"monogram":           sf.Monogram,
		"bio":                sf.Bio,
		"tagline":            sf.Tagline,
		"verified":           sf.Verified,
		"accent":             sf.Accent,
		"ink":                sf.Ink,
		"canvas":             sf.Canvas,
		"preset":             sf.Preset,
		"layout":             sf.Layout,
		"font":               sf.Font,
		"hero":               sf.Hero,
		"cards":              sf.Cards,
		"texture":            sf.Texture,
		"radius":             sf.Radius,
		"headerAlign":        sf.HeaderAlign,
		"featuredProductIds": sf.FeaturedProductIDs,
		"sections":           sf.Sections,
		"socials":            sf.Socials,
		"trustBadges":        sf.TrustBadges,
		"rating":             sf.Rating,
		"reviewCount":        sf.ReviewCount,
		"products":           products,
	}
	if sf.Announcement != "" {
		out["announcement"] = sf.Announcement
	}
	if sf.Revision > 0 {
		out["revision"] = sf.Revision
	}
	if sf.ETag != "" {
		out["etag"] = sf.ETag
	}
	return out
}
