package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/decode"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/presenters"
	"github.com/dasepmoch/fersaku-new/backend/internal/adapters/http/reqctx"
	"github.com/dasepmoch/fersaku-new/backend/internal/application"
	"github.com/dasepmoch/fersaku-new/backend/internal/domain/reviews"
	apperr "github.com/dasepmoch/fersaku-new/backend/internal/platform/errors"
)

// ReviewsHandler serves buyer review write + public product review reads (BE-430).
type ReviewsHandler struct {
	Svc *application.ReviewService
}

func (h *ReviewsHandler) Create(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Reviews unavailable"))
		return
	}
	var body struct {
		OrderItemID string  `json:"orderItemId"`
		ProductID   *string `json:"productId"`
		StoreID     *string `json:"storeId"`
		Rating      int32   `json:"rating"`
		Title       string  `json:"title"`
		Body        string  `json:"body"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	view, err := h.Svc.CreateReview(r.Context(), p.SubjectID, application.CreateReviewInput{
		OrderItemID: body.OrderItemID,
		ProductID:   body.ProductID,
		StoreID:     body.StoreID,
		Rating:      body.Rating,
		Title:       body.Title,
		Body:        body.Body,
	})
	if err != nil {
		// Conflict returns existing review + conflict code when already exists.
		if err == reviews.ErrAlreadyExists {
			presenters.WriteAppError(w, r, err)
			return
		}
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusCreated, view)
}

func (h *ReviewsHandler) Patch(w http.ResponseWriter, r *http.Request) {
	p, ok := reqctx.PrincipalFrom(r.Context())
	if !ok {
		presenters.WriteAppError(w, r, apperr.Unauthorized(apperr.CodeAuthRequired, "Authentication required"))
		return
	}
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Reviews unavailable"))
		return
	}
	var body struct {
		ExpectedVersion int32   `json:"expectedVersion"`
		Rating          *int32  `json:"rating"`
		Title           *string `json:"title"`
		Body            *string `json:"body"`
	}
	if err := decode.DecodeJSON(r, &body); err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	view, err := h.Svc.PatchReview(r.Context(), p.SubjectID, chi.URLParam(r, "reviewId"), application.PatchReviewInput{
		ExpectedVersion: body.ExpectedVersion,
		Rating:          body.Rating,
		Title:           body.Title,
		Body:            body.Body,
	})
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, view)
}

func (h *ReviewsHandler) PublicList(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Reviews unavailable"))
		return
	}
	productID := chi.URLParam(r, "productId")
	if productID == "" {
		productID = chi.URLParam(r, "idOrSlug")
	}
	limit := 0
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	items, next, hasMore, err := h.Svc.ListPublicByProduct(r.Context(), productID, r.URL.Query().Get("cursor"), limit)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteList(w, r, http.StatusOK, items, next, hasMore)
}

func (h *ReviewsHandler) PublicSummary(w http.ResponseWriter, r *http.Request) {
	if h.Svc == nil {
		presenters.WriteAppError(w, r, apperr.Internal(apperr.CodeInternalError, "Reviews unavailable"))
		return
	}
	productID := chi.URLParam(r, "productId")
	if productID == "" {
		productID = chi.URLParam(r, "idOrSlug")
	}
	sum, err := h.Svc.SummaryByProduct(r.Context(), productID)
	if err != nil {
		presenters.WriteAppError(w, r, err)
		return
	}
	presenters.WriteData(w, r, http.StatusOK, sum)
}
